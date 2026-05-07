import net from "node:net";

import {
  buildOrderCommandRenderLines,
  formatProductNameForCommand,
  formatVariantNameForCommand,
  getDefaultOrderCommandSettings,
  type OrderCommandRenderContext,
} from "@/lib/order-command-settings";
import type {
  PrinterPrintRequest,
  PrinterTestRequest,
  PrinterTransportResponse,
  TcpPrintJobPayload,
  TcpPrinterTarget,
} from "@/lib/printer-transport";

function getNowIso() {
  return new Date().toISOString();
}

function sanitizeEscPosText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLine(value: string, width = 42) {
  const sanitizedValue = sanitizeEscPosText(value);
  return sanitizedValue.length <= width ? sanitizedValue : sanitizedValue.slice(0, width);
}

function wrapLine(value: string, width = 42) {
  const sanitizedValue = sanitizeEscPosText(value);

  if (!sanitizedValue) {
    return [""];
  }

  const words = sanitizedValue.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  words.forEach((word) => {
    if (!currentLine) {
      currentLine = word.slice(0, width);
      if (word.length > width) {
        lines.push(currentLine);
        currentLine = word.slice(width);
      }
      return;
    }

    const nextCandidate = `${currentLine} ${word}`;
    if (nextCandidate.length <= width) {
      currentLine = nextCandidate;
      return;
    }

    lines.push(currentLine);
    currentLine = word.slice(0, width);
    if (word.length > width) {
      lines.push(currentLine);
      currentLine = word.slice(width);
    }
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [""];
}

function createSeparator(width: number) {
  return "-".repeat(Math.max(8, Math.min(width, 42)));
}

type EscPosLineStyle = {
  emphasized?: boolean;
  centered?: boolean;
  size?: number;
};

function appendStyledWrappedLines(
  chunks: Buffer[],
  value: string,
  width: number,
  style: EscPosLineStyle = {},
  indent = ""
) {
  const effectiveWidth = Math.max(width - indent.length, 8);
  const wrappedLines = wrapLine(value, effectiveWidth);
  const align = style.centered ? 1 : 0;
  const size = style.size ?? 0;
  const emphasized = style.emphasized ? 1 : 0;

  chunks.push(Buffer.from([0x1b, 0x61, align]));
  chunks.push(Buffer.from([0x1b, 0x45, emphasized]));
  chunks.push(Buffer.from([0x1d, 0x21, size]));

  wrappedLines.forEach((line) => {
    chunks.push(Buffer.from(`${indent}${line}\n`, "ascii"));
  });

  chunks.push(Buffer.from([0x1b, 0x45, 0x00]));
  chunks.push(Buffer.from([0x1d, 0x21, 0x00]));
  chunks.push(Buffer.from([0x1b, 0x61, 0x00]));
}

function pushItemLines(
  chunks: Buffer[],
  item: TcpPrintJobPayload["items"][number],
  width: number,
  productStyle: EscPosLineStyle,
  variantStyle: EscPosLineStyle,
  noteStyle: EscPosLineStyle
) {
  const quantityLabel = `${item.quantity}x`;
  const guestPrefix = item.guestCode?.trim() ? `[${item.guestCode.trim()}] ` : "";
  const primaryPrefix = `${quantityLabel} `;
  const continuationIndent = "   ";
  const availableWidth = Math.max(width - primaryPrefix.length, 8);
  const wrappedNameLines = wrapLine(`${guestPrefix}${item.name}`, availableWidth);

  wrappedNameLines.forEach((line, index) => {
    appendStyledWrappedLines(
      chunks,
      line,
      width,
      productStyle,
      index === 0 ? primaryPrefix : continuationIndent
    );
  });

  if (item.course?.trim()) {
    appendStyledWrappedLines(chunks, `Portata: ${item.course}`, width, variantStyle, "   ");
  }

  if (item.note?.trim()) {
    appendStyledWrappedLines(chunks, `Nota: ${item.note}`, width, noteStyle, "   ");
  }
}

function getSizeByteFromTitleScale(scale: "normal" | "double" | "extra-large") {
  if (scale === "extra-large") {
    return 0x22;
  }

  if (scale === "double") {
    return 0x11;
  }

  return 0x00;
}

function getSizeByteFromFontSize(size: number, fallbackDouble = 16) {
  if (size >= 28) {
    return 0x22;
  }

  return size >= fallbackDouble ? 0x11 : 0x00;
}

function getOrderTicketContext(job: TcpPrintJobPayload): OrderCommandRenderContext {
  return {
    tableLabel: job.tableLabel,
    roomLabel: job.roomLabel,
    operator: job.operator,
    createdAt: job.createdAt,
    commandNumber: job.commandNumber,
    guests: job.guests,
    customerLabel: job.customerLabel,
    companyLabel: job.companyLabel,
    total: job.total,
    items: job.items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      guestCode: item.guestCode ?? null,
      course: item.course,
      note: item.note,
    })),
  };
}

function appendRenderedOrderLines(
  chunks: Buffer[],
  width: number,
  job: TcpPrintJobPayload
) {
  const settings = job.commandSettingsSnapshot ?? getDefaultOrderCommandSettings();
  const effectiveWidth =
    Number(settings.lineCapacity) > 0 ? Number(settings.lineCapacity) : width;
  const lines = buildOrderCommandRenderLines(settings, getOrderTicketContext(job));

  for (let index = 0; index < settings.topSpacing; index += 1) {
    chunks.push(Buffer.from("\n", "ascii"));
  }

  lines.forEach((line, index) => {
    if (line.role === "separator") {
      appendStyledWrappedLines(chunks, createSeparator(effectiveWidth), effectiveWidth);
      return;
    }

    if (!line.text.trim()) {
      chunks.push(Buffer.from("\n", "ascii"));
      return;
    }

    if (line.role === "title") {
      appendStyledWrappedLines(
        chunks,
        line.text,
        effectiveWidth,
        {
          emphasized: line.fontWeight === "bold" || settings.titleBold || line.emphasized,
          centered: line.centered ?? settings.titleCentered,
          size: getSizeByteFromFontSize(line.fontSize ?? settings.commandTitle.fontSize, 20),
        }
      );
      return;
    }

    if (line.role === "header") {
      appendStyledWrappedLines(chunks, line.text, effectiveWidth, {
        emphasized: line.fontWeight === "bold" || line.emphasized,
        size: getSizeByteFromFontSize(line.fontSize ?? settings.headerFontSize, 15),
      });
      return;
    }

    if (line.role === "section") {
      appendStyledWrappedLines(chunks, line.text, effectiveWidth, {
        emphasized: line.fontWeight === "bold" || line.emphasized,
        centered: line.centered,
        size: getSizeByteFromFontSize(line.fontSize ?? settings.guestGroupFontSize, 16),
      });
      return;
    }

    if (line.role === "product") {
      appendStyledWrappedLines(chunks, line.text, effectiveWidth, {
        emphasized: settings.productBold || line.emphasized,
        size: getSizeByteFromFontSize(settings.productFontSize, 17),
      });
      return;
    }

    if (line.role === "variant") {
      appendStyledWrappedLines(chunks, line.text, effectiveWidth, {
        emphasized: settings.variantTextStyle === "bold" || line.emphasized,
        size:
          settings.variantSize === "double"
            ? 0x11
            : getSizeByteFromFontSize(settings.variantFontSize, 16),
      }, "   ");
      return;
    }

    if (line.role === "note") {
      appendStyledWrappedLines(chunks, line.text, effectiveWidth, {
        emphasized: settings.noteBold || line.emphasized,
        size: getSizeByteFromFontSize(settings.noteFontSize, 16),
      }, "   ");
      return;
    }

    if (line.role === "footer" || line.role === "total") {
      appendStyledWrappedLines(chunks, line.text, effectiveWidth, {
        emphasized: line.role === "total" || line.emphasized,
      });
      if (index < lines.length - 1) {
        chunks.push(Buffer.from("\n", "ascii"));
      }
    }
  });
}

function appendPrebillLines(
  chunks: Buffer[],
  width: number,
  job: TcpPrintJobPayload
) {
  appendStyledWrappedLines(chunks, "INKI MAKISUSHI APP", width, {
    emphasized: true,
    centered: true,
    size: 0x11,
  });
  appendStyledWrappedLines(chunks, "PRECONTO - NON FISCALE", width, {
    emphasized: true,
    centered: true,
    size: 0x11,
  });
  appendStyledWrappedLines(chunks, createSeparator(width), width);

  if (job.roomLabel) {
    appendStyledWrappedLines(chunks, `Sala: ${job.roomLabel}`, width);
  }
  if (job.tableLabel) {
    appendStyledWrappedLines(chunks, `Tavolo: ${job.tableLabel}`, width);
  }
  if (job.operator) {
    appendStyledWrappedLines(chunks, `Operatore: ${job.operator}`, width);
  }
  appendStyledWrappedLines(
    chunks,
    `Data: ${new Date(job.createdAt).toLocaleString("it-IT")}`,
    width
  );
  appendStyledWrappedLines(chunks, createSeparator(width), width);

  if (job.items.length > 0) {
    job.items.forEach((item) => {
      pushItemLines(
        chunks,
        item,
        width,
        { emphasized: true, size: 0x00 },
        { size: 0x00 },
        { size: 0x00 }
      );
    });
  } else {
    appendStyledWrappedLines(chunks, "Nessun prodotto nel tavolo", width);
  }

  appendStyledWrappedLines(chunks, createSeparator(width), width);

  if (typeof job.subtotal === "number") {
    appendStyledWrappedLines(chunks, `Subtotale: EUR ${job.subtotal.toFixed(2)}`, width);
  }
  if (job.discountLabel?.trim()) {
    appendStyledWrappedLines(chunks, `Sconto: ${job.discountLabel}`, width);
  }
  if (typeof job.total === "number") {
    appendStyledWrappedLines(chunks, `Totale: EUR ${job.total.toFixed(2)}`, width, {
      emphasized: true,
      size: 0x11,
    });
  }
}

function buildEscPosBufferForJob(printer: TcpPrinterTarget, job: TcpPrintJobPayload) {
  const width = printer.paperColumns && printer.paperColumns > 0 ? printer.paperColumns : 42;
  const chunks: Buffer[] = [
    Buffer.from([0x1b, 0x40]),
    Buffer.from([0x1b, 0x74, 0x10]),
  ];
  const separator = createSeparator(width);

  if (job.type === "test-print") {
    appendStyledWrappedLines(chunks, "TEST STAMPA BAR", width, {
      emphasized: true,
      centered: true,
      size: 0x11,
    });
    appendStyledWrappedLines(chunks, separator, width);
    appendStyledWrappedLines(chunks, `Stampante: ${normalizeLine(printer.name, width - 11)}`, width);
    appendStyledWrappedLines(chunks, `Sala: Sala 1`, width);
    appendStyledWrappedLines(chunks, `Tavolo: Tavolo 2`, width);
    appendStyledWrappedLines(chunks, `Operatore: Admin`, width);
    appendStyledWrappedLines(chunks, `Data: ${new Date().toLocaleString("it-IT")}`, width);
    appendStyledWrappedLines(chunks, separator, width);
    pushItemLines(
      chunks,
      {
        id: "test-item-1",
        name: formatProductNameForCommand("Calice Chardonnay", "uppercase"),
        quantity: 2,
        note: "",
        course: "PRIMA PORTATA",
      },
      width,
      { size: 0x00, emphasized: true },
      { size: 0x00 },
      { size: 0x00 }
    );
    pushItemLines(
      chunks,
      {
        id: "test-item-2",
        name: formatProductNameForCommand("Bao salmone", "uppercase"),
        quantity: 1,
        note: formatVariantNameForCommand("Senza salse", "normal"),
        course: "PRIMA PORTATA",
      },
      width,
      { size: 0x00, emphasized: true },
      { size: 0x00 },
      { size: 0x00 }
    );
    pushItemLines(
      chunks,
      {
        id: "test-item-3",
        name: formatProductNameForCommand("Tiramisu", "uppercase"),
        quantity: 1,
        note: "",
        course: "TERZA PORTATA",
      },
      width,
      { size: 0x00, emphasized: true },
      { size: 0x00 },
      { size: 0x00 }
    );
  } else {
    if (job.type === "order") {
      appendRenderedOrderLines(chunks, width, job);
    } else if (job.type === "prebill") {
      appendPrebillLines(chunks, width, job);
    } else if (job.type === "table-move") {
      appendStyledWrappedLines(chunks, "SPOSTAMENTO TAVOLO", width, {
        emphasized: true,
        centered: true,
        size: 0x11,
      });
      appendStyledWrappedLines(chunks, separator, width);
      if (job.sourceTableLabel) {
        appendStyledWrappedLines(chunks, `Tavolo origine: ${job.sourceTableLabel}`, width);
      }
      if (job.destinationTableLabel) {
        appendStyledWrappedLines(chunks, `Tavolo destinazione: ${job.destinationTableLabel}`, width);
      }
      if (job.roomLabel) {
        appendStyledWrappedLines(chunks, `Sala origine: ${job.roomLabel}`, width);
      }
      if (job.destinationRoomLabel) {
        appendStyledWrappedLines(chunks, `Sala destinazione: ${job.destinationRoomLabel}`, width);
      }
      if (job.operator) {
        appendStyledWrappedLines(chunks, `Operatore: ${job.operator}`, width);
      }
      appendStyledWrappedLines(
        chunks,
        `Data: ${new Date(job.createdAt).toLocaleString("it-IT")}`,
        width
      );
      if (typeof job.total === "number") {
        appendStyledWrappedLines(chunks, `Totale: EUR ${job.total.toFixed(2)}`, width, {
          emphasized: true,
        });
      }
      appendStyledWrappedLines(chunks, separator, width);
      if (job.items.length > 0) {
        job.items.forEach((item) => {
          pushItemLines(
            chunks,
            item,
            width,
            { emphasized: true, size: 0x00 },
            { size: 0x00 },
            { size: 0x00 }
          );
        });
      } else {
        appendStyledWrappedLines(chunks, "Nessun dettaglio articoli disponibile", width);
      }
    } else {
      appendStyledWrappedLines(chunks, normalizeLine(job.summary, width), width, {
        emphasized: true,
      });
      appendStyledWrappedLines(chunks, separator, width);
      if (job.roomLabel) {
        appendStyledWrappedLines(chunks, `Sala: ${job.roomLabel}`, width);
      }
      if (job.tableLabel) {
        appendStyledWrappedLines(chunks, `Tavolo: ${job.tableLabel}`, width);
      }
      if (job.operator) {
        appendStyledWrappedLines(chunks, `Operatore: ${job.operator}`, width);
      }
      if (job.documentType) {
        appendStyledWrappedLines(chunks, `Documento: ${job.documentType}`, width);
      }
      if (job.paymentMethod) {
        appendStyledWrappedLines(chunks, `Pagamento: ${job.paymentMethod}`, width);
      }
      appendStyledWrappedLines(
        chunks,
        `Data: ${new Date(job.createdAt).toLocaleString("it-IT")}`,
        width
      );
      appendStyledWrappedLines(chunks, separator, width);

      if (job.items.length > 0) {
        job.items.forEach((item) => {
          pushItemLines(
            chunks,
            item,
            width,
            { emphasized: true, size: 0x00 },
            { size: 0x00 },
            { size: 0x00 }
          );
        });
      } else {
        appendStyledWrappedLines(chunks, "Nessun prodotto nel payload", width);
      }

      if (typeof job.total === "number") {
        appendStyledWrappedLines(chunks, separator, width);
        appendStyledWrappedLines(chunks, `Totale: EUR ${job.total.toFixed(2)}`, width, {
          emphasized: true,
        });
      }
    }
  }

  chunks.push(Buffer.from("\n\n\n\n", "ascii"));
  chunks.push(Buffer.from([0x1b, 0x64, 0x04]));
  chunks.push(Buffer.from([0x1d, 0x56, 0x00]));

  return Buffer.concat(chunks);
}

function sendRawTcpPayload(
  printer: TcpPrinterTarget,
  payload?: Buffer
): Promise<PrinterTransportResponse> {
  return new Promise((resolve) => {
    // La stampante ESC/POS riceve solo bytes raw via TCP socket.
    // Nessuna richiesta HTTP deve essere inviata direttamente alla porta 9100.
    const host = printer.ipAddress.trim();
    const port = typeof printer.port === "number" && printer.port > 0 ? printer.port : 9100;
    const timeoutMs = Math.max(printer.timeoutMs || 3000, 500);
    let settled = false;
    let openedSocket = false;

    const finish = (result: PrinterTransportResponse) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };

    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);

    socket.once("connect", () => {
      openedSocket = true;

      if (!payload || payload.length === 0) {
        socket.end();
        finish({
          ok: true,
          message: `Socket TCP aperto su ${host}:${port}`,
          openedSocket: true,
          printed: false,
          at: getNowIso(),
        });
        return;
      }

      socket.write(payload, (error?: Error | null) => {
        if (error) {
          socket.destroy();
          const socketError = error as NodeJS.ErrnoException;
          finish({
            ok: false,
            message: `Invio TCP fallito verso ${host}:${port}`,
            openedSocket: true,
            printed: false,
            at: getNowIso(),
            errorCode: socketError.code || "WRITE_ERROR",
          });
          return;
        }

        socket.end();
        finish({
          ok: true,
          message: `Payload ESC/POS inviato a ${host}:${port}`,
          openedSocket: true,
          printed: true,
          at: getNowIso(),
        });
      });
    });

    socket.once("timeout", () => {
      socket.destroy();
      finish({
        ok: false,
        message: `Timeout TCP verso ${host}:${port}`,
        openedSocket,
        printed: false,
        at: getNowIso(),
        errorCode: "TIMEOUT",
      });
    });

    socket.once("error", (error: NodeJS.ErrnoException) => {
      socket.destroy();
      finish({
        ok: false,
        message: `Connessione TCP fallita verso ${host}:${port}`,
        openedSocket,
        printed: false,
        at: getNowIso(),
        errorCode: error.code || "SOCKET_ERROR",
      });
    });

    socket.connect(port, host);
  });
}

export async function runPrinterConnectionTest(
  request: PrinterTestRequest
): Promise<PrinterTransportResponse> {
  const { printer, mode = "connection" } = request;

  if (!printer.ipAddress.trim()) {
    return {
      ok: false,
      message: "Configurazione incompleta: indirizzo IP mancante",
      openedSocket: false,
      printed: false,
      at: getNowIso(),
      errorCode: "MISSING_IP",
    };
  }

  if (!printer.port || printer.port <= 0) {
    return {
      ok: false,
      message: "Configurazione incompleta: porta mancante",
      openedSocket: false,
      printed: false,
      at: getNowIso(),
      errorCode: "MISSING_PORT",
    };
  }

  if (mode === "print" && printer.model === "ESC/POS") {
    return sendRawTcpPayload(printer, buildEscPosBufferForJob(printer, {
      id: `test-${Date.now()}`,
      type: "test-print",
      summary: "TEST STAMPA BAR",
      createdAt: getNowIso(),
      items: [],
    }));
  }

  return sendRawTcpPayload(printer);
}

export async function runPrinterPrint(request: PrinterPrintRequest): Promise<PrinterTransportResponse> {
  const { printer, job } = request;

  if (printer.model !== "ESC/POS") {
    return {
      ok: true,
      message: `Invio reale non ancora implementato per ${printer.model}; il job resta tracciato nel gestionale`,
      openedSocket: false,
      printed: false,
      at: getNowIso(),
    };
  }

  return sendRawTcpPayload(printer, buildEscPosBufferForJob(printer, job));
}
