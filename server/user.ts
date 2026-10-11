// server/models/dbModels.ts
import mongoose, { Schema, Document } from 'mongoose';

// 1. User Schema & Model
export interface IUser extends Document {
  email: string;
  name: string;
  picture?: string;
  createdAt: Date;
}

const UserSchema = new Schema<IUser>({
  email: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  picture: { type: String },
  createdAt: { type: Date, default: Date.now }
});

export const User = mongoose.model<IUser>('User', UserSchema);

// 2. Session Schema & Model
export interface IMessage {
  sender: 'user' | 'ai';
  text: string;
  timestamp: Date;
}

export interface ISession extends Document {
  userEmail: string;
  title: string;
  readinessTier: string;
  score: number;
  grade: string;
  messages: IMessage[];
  createdAt: Date;
}

const MessageSchema = new Schema<IMessage>({
  sender: { type: String, enum: ['user', 'ai'], required: true },
  text: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

const SessionSchema = new Schema<ISession>({
  userEmail: { type: String, required: true, index: true },
  title: { type: String, required: true },
  readinessTier: { type: String, default: 'Uncalibrated' },
  score: { type: Number, default: 0 },
  grade: { type: String, default: 'mid' },
  messages: [MessageSchema],
  createdAt: { type: Date, default: Date.now }
});

export const Session = mongoose.model<ISession>('Session', SessionSchema);