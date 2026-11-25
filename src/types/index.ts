export type UserRole = "ADMIN_MASTER" | "ADMIN" | "OPERATOR";

export type OrderStatus = "PENDENTE" | "EM_ROTA" | "CONCLUIDO" | "CANCELADO";

export type ActionType = "TROCA" | "COLETA";

export type ContainerType = "CAIXA_CACAMBA" | "TAMBOR";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt?: string;
}

export interface CompanyContact {
  id: string;
  name: string;
  phone: string;
  companyId: string;
}

export interface CompanyItem {
  id: string;
  name: string;
  document: string | null;
  address: string | null;
  contacts?: CompanyContact[];
}

export interface OrderItem {
  id: string;
  requesterName: string;
  requesterPhone: string | null;
  companyId: string | null;
  company: {
    id: string;
    name: string;
    document: string | null;
    address: string | null;
  } | null;
  companyFallbackNote: string | null;
  actionType: ActionType;
  containerType: ContainerType;
  quantity: number;
  rawMessage: string;
  status: OrderStatus;
  priorityOrder: number;
  needsReview: boolean;
  scheduledDate: string | null;
  truckUsed: string | null;
  collectedBy: string | null;
  notes: string | null;
  completedAt: string | null;
  manuallyEdited: boolean;
  lockedFields: string;
  createdAt: string;
  updatedAt: string;
}

export interface RegistrationRequestItem {
  id: string;
  name: string;
  email: string;
  requestedRole: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}

export interface AccessKeyItem {
  id: string;
  code: string;
  roleToGrant: "ADMIN" | "OPERATOR";
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
  createdBy: {
    name: string;
    email: string;
  };
  usedBy: {
    name: string;
    email: string;
  } | null;
}
