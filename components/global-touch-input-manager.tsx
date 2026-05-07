"use client";

import { useEffect } from "react";

type EditableElement =
  | HTMLInputElement
  | HTMLTextAreaElement
  | (HTMLElement & { isContentEditable: true });

type ActionableElement = HTMLButtonElement | HTMLAnchorElement | HTMLSelectElement | HTMLElement;

function isVisible(element: Element | null) {
  return Boolean(element && element.getClientRects().length > 0);
}

function isEditableTarget(element: Element | null): element is EditableElement {
  if (!element || !isVisible(element)) {
    return false;
  }

  if (element instanceof HTMLTextAreaElement) {
    return !element.disabled && !element.readOnly;
  }

  if (element instanceof HTMLInputElement) {
    const nonTextInputTypes = new Set([
      "hidden",
      "checkbox",
      "radio",
      "button",
      "submit",
      "reset",
      "range",
      "color",
      "file",
      "image",
    ]);

    return !element.disabled && !element.readOnly && !nonTextInputTypes.has(element.type);
  }

  return element instanceof HTMLElement && element.isContentEditable;
}

function resolveEditableTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return null;
  }

  if (isEditableTarget(target)) {
    return target;
  }

  const nestedEditable = target.closest("input, textarea, [contenteditable='true']");

  if (isEditableTarget(nestedEditable)) {
    return nestedEditable;
  }

  const label = target.closest("label");

  if (label) {
    const labeledEditable = label.querySelector("input, textarea, [contenteditable='true']");

    if (isEditableTarget(labeledEditable)) {
      return labeledEditable;
    }

    if (label instanceof HTMLLabelElement && label.htmlFor) {
      const linkedElement = document.getElementById(label.htmlFor);

      if (isEditableTarget(linkedElement)) {
        return linkedElement;
      }
    }
  }

  return null;
}

function focusEditableTarget(target: EditableElement) {
  target.focus({ preventScroll: true });

  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    const valueLength = target.value.length;

    try {
      target.setSelectionRange(valueLength, valueLength);
    } catch {
      // Some input types on mobile Safari do not support selection APIs.
    }
  }

  window.setTimeout(() => {
    target.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: "smooth",
    });
  }, 180);
}

function blurActiveEditable() {
  const activeElement = document.activeElement;

  if (isEditableTarget(activeElement)) {
    activeElement.blur();
  }
}

function inferInputMode(input: HTMLInputElement | HTMLTextAreaElement) {
  const type = input.getAttribute("type")?.toLowerCase() ?? "";
  const placeholder = (input.getAttribute("placeholder") ?? "").toLowerCase();
  const name = (input.getAttribute("name") ?? "").toLowerCase();
  const labelHint = `${placeholder} ${name}`;

  if (
    type === "number" ||
    labelHint.includes("prezzo") ||
    labelHint.includes("price") ||
    labelHint.includes("importo") ||
    labelHint.includes("amount") ||
    labelHint.includes("totale") ||
    labelHint.includes("quantity") ||
    labelHint.includes("quantit") ||
    labelHint.includes("coperti") ||
    labelHint.includes("punti") ||
    labelHint.includes("points") ||
    labelHint.includes("sconto") ||
    labelHint.includes("discount") ||
    labelHint.includes("percent") ||
    labelHint.includes("iva") ||
    labelHint.includes("ip")
  ) {
    return "decimal";
  }

  if (type === "tel" || labelHint.includes("telefono") || labelHint.includes("phone")) {
    return "tel";
  }

  if (type === "email" || labelHint.includes("email")) {
    return "email";
  }

  if (type === "search" || labelHint.includes("cerca") || labelHint.includes("search")) {
    return "search";
  }

  if (type === "url") {
    return "url";
  }

  if (type === "date" || type === "time" || type === "datetime-local") {
    return "numeric";
  }

  if (type === "password") {
    return "text";
  }

  return "text";
}

function inferEnterKeyHint(input: HTMLInputElement | HTMLTextAreaElement) {
  const placeholder = (input.getAttribute("placeholder") ?? "").toLowerCase();

  if (placeholder.includes("cerca") || placeholder.includes("search")) {
    return "search";
  }

  if (input instanceof HTMLTextAreaElement) {
    return "done";
  }

  return "done";
}

function styleModalContainer(container: HTMLElement) {
  container.style.maxHeight = "calc(100dvh - 1.5rem)";
  container.style.overflowY = "auto";
  container.style.overscrollBehavior = "contain";
  container.style.paddingBottom =
    "max(1rem, calc(env(safe-area-inset-bottom, 0px) + env(keyboard-inset-height, 0px) + 1rem))";
  container.style.scrollPaddingBottom =
    "max(6rem, calc(env(safe-area-inset-bottom, 0px) + env(keyboard-inset-height, 0px) + 5rem))";
  container.style.setProperty("-webkit-overflow-scrolling", "touch");
}

function decorateEditableFields(root: ParentNode = document) {
  const fields = root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea");

  fields.forEach((field) => {
    if (field instanceof HTMLInputElement && field.type === "hidden") {
      return;
    }

    if (!field.getAttribute("inputmode")) {
      field.setAttribute("inputmode", inferInputMode(field));
    }

    if (!field.getAttribute("enterkeyhint")) {
      field.setAttribute("enterkeyhint", inferEnterKeyHint(field));
    }

    field.style.scrollMarginBottom = "320px";
  });

  const modalCandidates =
    root instanceof HTMLElement
      ? [root, ...Array.from(root.querySelectorAll<HTMLElement>("div, section, aside"))]
      : Array.from(root.querySelectorAll<HTMLElement>("div, section, aside"));

  modalCandidates.forEach((element) => {
    if (isModalLikeContainer(element)) {
      styleModalContainer(element);
    }
  });
}

function isModalLikeContainer(element: Element | null) {
  if (!(element instanceof HTMLElement) || !isVisible(element)) {
    return false;
  }

  const className = typeof element.className === "string" ? element.className : "";

  return (
    className.includes("inset-0") &&
    (className.includes("fixed") || className.includes("absolute")) &&
    className.includes("z-")
  );
}

function findFirstFocusableInModal(root: ParentNode) {
  const candidates = root.querySelectorAll("input, textarea, [contenteditable='true']");
  return Array.from(candidates).find((candidate) => isEditableTarget(candidate)) ?? null;
}

function findLatestModalFocusable() {
  const modalCandidates = Array.from(document.querySelectorAll<HTMLElement>("div, section, aside")).filter(
    (element) => isModalLikeContainer(element)
  );

  for (let index = modalCandidates.length - 1; index >= 0; index -= 1) {
    const focusable = findFirstFocusableInModal(modalCandidates[index]);

    if (focusable && isEditableTarget(focusable)) {
      return focusable;
    }
  }

  return null;
}

function resolveActionableTarget(target: EventTarget | null): ActionableElement | null {
  if (!(target instanceof Element)) {
    return null;
  }

  const actionable = target.closest(
    "button, a, select, [role='button'], [data-close-keyboard], [type='submit'], [type='button'], [type='reset']"
  );

  return actionable instanceof HTMLElement ? actionable : null;
}

export function GlobalTouchInputManager() {
  useEffect(() => {
    decorateEditableFields();

    const handlePointerDown = (event: PointerEvent) => {
      const target = resolveEditableTarget(event.target);

      if (target) {
        decorateEditableFields(target.ownerDocument);
        focusEditableTarget(target);
        return;
      }

      if (resolveActionableTarget(event.target)) {
        window.setTimeout(() => {
          blurActiveEditable();
        }, 0);
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      const target = resolveEditableTarget(event.target);

      if (!target) {
        return;
      }

      decorateEditableFields(target.ownerDocument);
      window.setTimeout(() => {
        target.scrollIntoView({
          block: "center",
          inline: "nearest",
          behavior: "smooth",
        });
      }, 220);
    };

    const handleViewportResize = () => {
      const activeElement = document.activeElement;

      if (!isEditableTarget(activeElement)) {
        return;
      }

      window.setTimeout(() => {
        activeElement.scrollIntoView({
          block: "center",
          inline: "nearest",
          behavior: "smooth",
        });
      }, 80);
    };

    let autofocusTimeout = 0;
    const scheduleModalAutofocus = () => {
      window.clearTimeout(autofocusTimeout);
      autofocusTimeout = window.setTimeout(() => {
        const activeElement = document.activeElement;

        if (isEditableTarget(activeElement)) {
          return;
        }

        const nextTarget = findLatestModalFocusable();

        if (nextTarget && isEditableTarget(nextTarget)) {
          decorateEditableFields(nextTarget.ownerDocument);
          focusEditableTarget(nextTarget);
        }
      }, 40);
    };

    const observer = new MutationObserver((mutations) => {
      let shouldAutofocus = false;

      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) {
            return;
          }

          decorateEditableFields(node);

          if (isModalLikeContainer(node) || node.querySelector("[class*='inset-0']")) {
            shouldAutofocus = true;
          }
        });
      });

      if (shouldAutofocus) {
        scheduleModalAutofocus();
      }
    });

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("focusin", handleFocusIn, true);
    window.visualViewport?.addEventListener("resize", handleViewportResize);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      window.clearTimeout(autofocusTimeout);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("focusin", handleFocusIn, true);
      window.visualViewport?.removeEventListener("resize", handleViewportResize);
      observer.disconnect();
    };
  }, []);

  return null;
}
