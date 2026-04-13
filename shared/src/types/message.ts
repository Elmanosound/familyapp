export type MessageType = 'text' | 'image' | 'video' | 'system';

export interface ReadReceipt {
  user: string;
  readAt: string;
}

export interface Message {
  _id: string;
  familyId: string;
  sender: string;
  type: MessageType;
  content: string;
  mediaUrl?: string;
  mediaThumbnailUrl?: string;
  replyTo?: string;
  readBy: ReadReceipt[];
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SendMessageData {
  content: string;
  type: MessageType;
  replyTo?: string;
}
