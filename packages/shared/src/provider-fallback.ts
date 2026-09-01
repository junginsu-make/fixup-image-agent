export interface IssueFallbackLabels {
  primaryFailure: string;
  backupMissing: string;
  backupFailure: string;
  backupSuccess: string;
}

export interface IssueFallbackResult<T> {
  value?: T;
  issues: string[];
}

export function failureReason(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** 주 제공자를 먼저 쓰고, 실패 이유를 버리지 않은 채 예비 제공자를 한 번 시도한다. */
export async function withIssueFallback<T>(
  primary: () => Promise<T>,
  backup: (() => Promise<T>) | undefined,
  labels: IssueFallbackLabels,
): Promise<IssueFallbackResult<T>> {
  try {
    return { value: await primary(), issues: [] };
  } catch (primaryError) {
    const primaryReason = failureReason(primaryError);
    if (!backup) {
      return {
        issues: [
          `${labels.primaryFailure}: ${primaryReason}`,
          labels.backupMissing,
        ],
      };
    }
    try {
      return {
        value: await backup(),
        issues: [`${labels.backupSuccess}: ${primaryReason}`],
      };
    } catch (backupError) {
      return {
        issues: [
          `${labels.primaryFailure}: ${primaryReason}`,
          `${labels.backupFailure}: ${failureReason(backupError)}`,
        ],
      };
    }
  }
}
