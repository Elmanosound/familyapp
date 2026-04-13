export type FamilyType = 'family' | 'friends' | 'neighbors' | 'custom';
export type MemberRole = 'admin' | 'member' | 'child';

export interface FamilyMember {
  user: string;
  role: MemberRole;
  color: string;
  joinedAt: string;
}

export interface FamilySettings {
  locationSharingEnabled: boolean;
  defaultCurrency: string;
}

export interface Family {
  _id: string;
  name: string;
  type: FamilyType;
  avatarUrl?: string;
  createdBy: string;
  members: FamilyMember[];
  settings: FamilySettings;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFamilyData {
  name: string;
  type: FamilyType;
}

export interface InviteMemberData {
  email: string;
  role: MemberRole;
}

export interface Invitation {
  _id: string;
  familyId: string;
  invitedBy: string;
  email: string;
  role: MemberRole;
  token: string;
  status: 'pending' | 'accepted' | 'expired';
  expiresAt: string;
  createdAt: string;
}
