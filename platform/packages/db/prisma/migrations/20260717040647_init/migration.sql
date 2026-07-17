-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('QUEUED', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "SourceStatus" AS ENUM ('PENDING', 'INGESTING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "ClipStatus" AS ENUM ('SELECTED', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "Resolution" AS ENUM ('R720', 'R1080', 'R4K');

-- CreateEnum
CREATE TYPE "RenderStatus" AS ENUM ('QUEUED', 'RENDERING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "ReframeMode" AS ENUM ('FACE_TRACK', 'CENTER', 'SPLIT');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('WATERMARK', 'LOGO', 'BROLL', 'FONT', 'MUSIC', 'OTHER');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('TIKTOK', 'YOUTUBE', 'INSTAGRAM', 'X');

-- CreateEnum
CREATE TYPE "SocialAccountStatus" AS ENUM ('STUB', 'CONNECTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'POSTED', 'FAILED');

-- CreateEnum
CREATE TYPE "LedgerReason" AS ENUM ('STAGE_CHARGE', 'ADDON_CHARGE', 'GRANT', 'REFUND', 'PLAN_RENEWAL');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'STUB');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "planId" TEXT NOT NULL DEFAULT 'FREE',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "folderId" TEXT,
    "title" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'QUEUED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceVideo" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "originUrl" TEXT,
    "uploadKey" TEXT,
    "contentHash" TEXT,
    "durationSec" DOUBLE PRECISION,
    "width" INTEGER,
    "height" INTEGER,
    "fps" DOUBLE PRECISION,
    "normalizedKey" TEXT,
    "thumbKeys" JSONB,
    "status" "SourceStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceVideo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimelineMetadata" (
    "id" TEXT NOT NULL,
    "sourceVideoId" TEXT NOT NULL,
    "language" TEXT,
    "transcript" JSONB,
    "scenes" JSONB,
    "faceTracks" JSONB,
    "audioEnergy" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimelineMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Clip" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "startSec" DOUBLE PRECISION NOT NULL,
    "endSec" DOUBLE PRECISION NOT NULL,
    "title" TEXT NOT NULL,
    "hookText" TEXT,
    "viralityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "viralityBreakdown" JSONB,
    "viralityReason" TEXT,
    "transcriptSlice" JSONB,
    "status" "ClipStatus" NOT NULL DEFAULT 'SELECTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "contentMetadata" JSONB,

    CONSTRAINT "Clip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditDecision" (
    "id" TEXT NOT NULL,
    "clipId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "ops" JSONB NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EditDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Render" (
    "id" TEXT NOT NULL,
    "clipId" TEXT NOT NULL,
    "editVersion" INTEGER NOT NULL,
    "resolution" "Resolution" NOT NULL DEFAULT 'R1080',
    "status" "RenderStatus" NOT NULL DEFAULT 'QUEUED',
    "outputKey" TEXT,
    "thumbKey" TEXT,
    "durationSec" DOUBLE PRECISION,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Render_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaptionSet" (
    "id" TEXT NOT NULL,
    "clipId" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "lines" JSONB NOT NULL,
    "style" JSONB,

    CONSTRAINT "CaptionSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReframePlan" (
    "id" TEXT NOT NULL,
    "clipId" TEXT NOT NULL,
    "mode" "ReframeMode" NOT NULL DEFAULT 'FACE_TRACK',
    "aspect" TEXT NOT NULL DEFAULT '9:16',
    "keyframes" JSONB NOT NULL,

    CONSTRAINT "ReframePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandTemplate" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "captionStyle" JSONB,
    "watermarkAssetId" TEXT,
    "fontId" TEXT,
    "colors" JSONB,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "BrandTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Font" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "family" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,

    CONSTRAINT "Font_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VocabTerm" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "soundsLike" TEXT,

    CONSTRAINT "VocabTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" "AssetKind" NOT NULL DEFAULT 'OTHER',
    "fileKey" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Folder" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,

    CONSTRAINT "Folder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialAccount" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "handle" TEXT NOT NULL,
    "oauthBlob" JSONB,
    "status" "SocialAccountStatus" NOT NULL DEFAULT 'STUB',

    CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Publication" (
    "id" TEXT NOT NULL,
    "clipId" TEXT NOT NULL,
    "socialAccountId" TEXT,
    "platform" "Platform" NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "hashtags" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Publication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditLedger" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" "LedgerReason" NOT NULL,
    "stage" TEXT,
    "jobId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'STUB',
    "renewsAt" TIMESTAMP(3),

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hashedKey" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" TEXT[],
    "secret" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'videoPipeline',
    "stage" TEXT,
    "stageStatus" JSONB NOT NULL DEFAULT '{}',
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "OtpCode_userId_idx" ON "OtpCode"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_workspaceId_key" ON "Membership"("userId", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceVideo_projectId_key" ON "SourceVideo"("projectId");

-- CreateIndex
CREATE INDEX "SourceVideo_contentHash_idx" ON "SourceVideo"("contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "TimelineMetadata_sourceVideoId_key" ON "TimelineMetadata"("sourceVideoId");

-- CreateIndex
CREATE UNIQUE INDEX "EditDecision_clipId_key" ON "EditDecision"("clipId");

-- CreateIndex
CREATE INDEX "Render_clipId_editVersion_idx" ON "Render"("clipId", "editVersion");

-- CreateIndex
CREATE UNIQUE INDEX "CaptionSet_clipId_key" ON "CaptionSet"("clipId");

-- CreateIndex
CREATE UNIQUE INDEX "ReframePlan_clipId_key" ON "ReframePlan"("clipId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditLedger_idempotencyKey_key" ON "CreditLedger"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CreditLedger_workspaceId_createdAt_idx" ON "CreditLedger"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_workspaceId_key" ON "Subscription"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_hashedKey_key" ON "ApiKey"("hashedKey");

-- CreateIndex
CREATE UNIQUE INDEX "Job_workflowId_key" ON "Job"("workflowId");

-- AddForeignKey
ALTER TABLE "OtpCode" ADD CONSTRAINT "OtpCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceVideo" ADD CONSTRAINT "SourceVideo_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineMetadata" ADD CONSTRAINT "TimelineMetadata_sourceVideoId_fkey" FOREIGN KEY ("sourceVideoId") REFERENCES "SourceVideo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clip" ADD CONSTRAINT "Clip_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditDecision" ADD CONSTRAINT "EditDecision_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "Clip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Render" ADD CONSTRAINT "Render_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "Clip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaptionSet" ADD CONSTRAINT "CaptionSet_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "Clip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReframePlan" ADD CONSTRAINT "ReframePlan_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "Clip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandTemplate" ADD CONSTRAINT "BrandTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Font" ADD CONSTRAINT "Font_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabTerm" ADD CONSTRAINT "VocabTerm_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "Clip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLedger" ADD CONSTRAINT "CreditLedger_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
