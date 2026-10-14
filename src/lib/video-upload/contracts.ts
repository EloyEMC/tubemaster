import type { CredentialRef, ResolvedCredentials } from "../video-metadata/contracts";
import type { QuotaAccountant } from "../quota/accountant";
import type { Readable } from "node:stream";

export type UploadRequest = {
  credentialRef: CredentialRef;
  expectedChannelId: string;
  filePath: string;
  title: string;
  description?: string;
  visibility: "private";
  dryRun?: boolean;
  confirmed?: boolean;
};

export type UploadResult =
  | { status: "validated"; operationId: string; channelId: string; dryRun: true }
  | { status: "uploaded"; operationId: string; channelId: string; videoId: string; visibility: "private"; dryRun: false };

export type UploadFile = { size: number; open(): Readable };
export type UploadFileSource = { inspect(path: string): Promise<UploadFile> };
export type UploadProvider = {
  insert(args: {
    credentials: ResolvedCredentials;
    file: UploadFile;
    title: string;
    description: string;
    operationId: string;
    channelId: string;
    quotaAccountant?: QuotaAccountant;
  }): Promise<string>;
};
