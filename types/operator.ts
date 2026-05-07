export type OperatorRoleId = "admin" | "operator1" | "operator2" | "operator3";

export type OperatorRoleType = "admin" | "operator";

export type OperatorPermissions = {
  canManageCash: boolean;
  canOpenDrawer: boolean;
  canCloseCash: boolean;
  canAccessBasePrices: boolean;
  canApplyDiscounts: boolean;
  canApplySurcharges: boolean;
  canEditPaymentCalculator: boolean;
  canAccessPayments: boolean;
  canConfirmPayments: boolean;
  canUseCashPayments: boolean;
  canUseCardPayments: boolean;
  canUseOtherPaymentMethods: boolean;
  canOpenTables: boolean;
  canEditTables: boolean;
  canMergeTables: boolean;
  canSplitTables: boolean;
  canCloseTables: boolean;
  canInsertProducts: boolean;
  canEditOrders: boolean;
  canDeleteOrderLines: boolean;
  canSendOrders: boolean;
  canSaveOrderChanges: boolean;
  canAccessSettings: boolean;
  canManagePrinters: boolean;
  canManagePaymentsSettings: boolean;
  canManageVatSettings: boolean;
  canManageOrderSettings: boolean;
  canManageRoles: boolean;
  canAssignCustomer: boolean;
  canAssignCompany: boolean;
  canManageCustomersBilling: boolean;
};

export type PosOperatorRecord = {
  id: OperatorRoleId;
  internalKey: string;
  username: string;
  roleType: OperatorRoleType;
  role: OperatorRoleType;
  defaultName: string;
  displayName: string;
  enabled: boolean;
  passwordHash: string;
  order: number;
  permissions: OperatorPermissions;
  createdAt: string;
  updatedAt: string;
};

export type PosOperatorSession = {
  sessionId: string;
  authenticated: boolean;
  operatorId: OperatorRoleId;
  operatorName: string;
  role: OperatorRoleType;
  loginAt: string | null;
  workstationId: string;
  updatedAt: string;
};

export type OperatorActorSnapshot = {
  operatorId: OperatorRoleId;
  operatorName: string;
  role: OperatorRoleType;
  sessionId?: string;
  workstationId?: string;
};
