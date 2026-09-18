import { describe, expect, it } from "vitest";
import { personSourceConflict, resolvePersonSource } from "./pdp.person-source";
import { PdpService } from "./pdp.service";

/**
 * **둘 다 골랐으면 물어본다**(U-04).
 *
 * 인물 사진을 올리고 저장 캐릭터도 고르면, 서버가 **말없이 업로드 쪽을 쓰고
 * 캐릭터를 버렸다.** 캐릭터를 방금 고른 사용자는 자기 선택이 무시된 것을
 * 모른다 — 이미지가 나온 뒤에야 다른 사람이 보인다. 한 장에 값이 든다.
 *
 * 설계 §6: 「인물 업로드와 저장 캐릭터가 동시에 지정되면 **명시적으로 적용
 * 대상을 선택하게 한다. 우선순위로 하나를 조용히 버리지 않는다.**」
 */

describe("둘 다 있으면 충돌이다", () => {
  it("**둘 다 있으면 물어봐야 한다**", () => {
    expect(personSourceConflict({ hasUploadedPerson: true, hasCharacter: true })).toBe(true);
  });

  it("하나뿐이면 물을 것이 없다", () => {
    expect(personSourceConflict({ hasUploadedPerson: true, hasCharacter: false })).toBe(false);
    expect(personSourceConflict({ hasUploadedPerson: false, hasCharacter: true })).toBe(false);
    expect(personSourceConflict({ hasUploadedPerson: false, hasCharacter: false })).toBe(false);
  });
});

describe("누구를 쓸지 정한다", () => {
  it("**고른 대로 쓴다**", () => {
    expect(
      resolvePersonSource({ hasUploadedPerson: true, hasCharacter: true, choice: "character" }),
    ).toBe("character");
    expect(
      resolvePersonSource({ hasUploadedPerson: true, hasCharacter: true, choice: "uploaded" }),
    ).toBe("uploaded");
  });

  it("**없는 것을 고르면 있는 쪽을 쓴다** — 뺀 뒤에도 옛 선택이 남을 수 있다", () => {
    expect(
      resolvePersonSource({ hasUploadedPerson: false, hasCharacter: true, choice: "uploaded" }),
    ).toBe("character");
    expect(
      resolvePersonSource({ hasUploadedPerson: true, hasCharacter: false, choice: "character" }),
    ).toBe("uploaded");
  });

  it("**안 골랐으면 업로드가 이긴다** — 옛 초안이 조용히 달라지지 않는다", () => {
    expect(resolvePersonSource({ hasUploadedPerson: true, hasCharacter: true })).toBe("uploaded");
  });

  it("사람이 없으면 아무도 안 쓴다", () => {
    expect(resolvePersonSource({ hasUploadedPerson: false, hasCharacter: false })).toBe("none");
  });
});

describe("실제로 돌려 본다", () => {
  let llm호출 = 0;
  /** 던져도 무엇을 보냈는지는 남는다. */
  const 담긴것: string[] = [];

  const 보낸참조 = async (options: Record<string, unknown>) => {
    담긴것.length = 0;
    llm호출 = 0;
    await new PdpService().generateSectionImage(
      {
        originalImageBase64: "PRODUCT",
        section: {
          section_id: "S1", section_name: "히어로", goal: "", headline: "", subheadline: "",
          bullets: [], trust_or_objection_line: "", CTA: "", prompt_ko: "", prompt_en: "a scene",
          layout_notes: "",
        } as never,
        aspectRatio: "3:4",
        options: {
          style: "studio",
          withModel: true,
          referenceModelImageBase64: "UPLOADEDFACE",
          referenceModelImageMimeType: "image/png",
          characterReferences: [{ base64: "CHARACTERFACE", mimeType: "image/png" }],
          ...options,
        } as never,
      },
      {
        /*
          **동일 인물 검증을 일부러 떨어뜨린다**(`isSamePerson: false`).

          전에는 여기를 `true` 로 고정했는데, 그것이 **결함을 덮었다** — 캐릭터를
          골랐는데도 업로드 얼굴과 대조하던 버그가 「통과」로 보였다. 검증이
          돌았다면 여기서 재시도가 세 번 나고 요청이 실패한다.
        */
        llm: {
          generate: async () => {
            llm호출 += 1;
            return {
              text: JSON.stringify({
                defects: [],
                genderPresentation: "female", ageImpression: "20s", faceShape: "oval",
                hairstyle: "단발", skinTone: "밝은", eyeDetails: "", browDetails: "",
                lipDetails: "", overallVibe: "", keepTraits: [], distinctiveFeatures: [],
                isSamePerson: false, genderPresentationPreserved: false, styleMatch: false,
                confidence: "high", reason: "", correctionFocus: [],
              }),
            };
          },
        },
        generateImage: async (_model: string, input: unknown) => {
          담긴것.push(JSON.stringify(input));
          return { base64: "OUT", mimeType: "image/png" };
        },
      } as never,
    );
    return 담긴것.join(" ");
  };

  it("**캐릭터를 골랐으면 캐릭터가 간다**", async () => {
    const 보낸것 = await 보낸참조({ personSource: "character" });

    expect(보낸것).toContain("CHARACTERFACE");
    expect(보낸것).not.toContain("UPLOADEDFACE");
  });

  /** 업로드 경로는 검증이 떨어져 끝내 던진다. 그 전에 무엇을 보냈는지만 본다. */
  const 보낸참조_던져도 = async (options: Record<string, unknown>) => {
    try {
      return await 보낸참조(options);
    } catch {
      return 담긴것.join(" ");
    }
  };

  it("업로드를 골랐으면 업로드가 간다", async () => {
    const 보낸것 = await 보낸참조_던져도({ personSource: "uploaded" });

    expect(보낸것).toContain("UPLOADEDFACE");
    expect(보낸것).not.toContain("CHARACTERFACE");
  });

  it("**안 골랐으면 전과 같다** — 옛 초안이 조용히 달라지지 않는다", async () => {
    const 보낸것 = await 보낸참조_던져도({});

    expect(보낸것).toContain("UPLOADEDFACE");
    expect(보낸것).not.toContain("CHARACTERFACE");
  });

  it("**얼굴은 여전히 하나만 간다** — 둘을 넣으면 제3의 인물이 나온다", async () => {
    const 보낸것 = await 보낸참조({ personSource: "character" });

    expect(보낸것.match(/"kind":"person"/g) ?? []).toHaveLength(1);
  });

  /**
   * **안 쓸 얼굴로 채점하지 않는다.**
   *
   * 전에는 참조를 담는 자리만 고쳤다. 프로필 뽑기·재시도 상한·동일 인물 검증은
   * 옛 조건을 그대로 써서, 캐릭터를 골라도 **업로드 얼굴과 대조**했다 — 당연히
   * 불일치라 세 장을 태우고 요청이 실패한다.
   */
  it("**캐릭터를 골랐으면 업로드 얼굴로 채점하지 않는다**", async () => {
    // 검증이 돌면 여기서 떨어져 재시도가 난다(stub 이 isSamePerson:false).
    const 보낸것 = await 보낸참조({ personSource: "character" });

    // 한 장만 만든다. 검증이 돌았다면 세 장이다.
    expect(보낸것.match(/"prompt"/g) ?? []).toHaveLength(1);
    // 프로필 뽑기도 안 돈다.
    expect(llm호출).toBe(0);
  });

  it("업로드를 골랐으면 검증은 그대로 돈다 — 보호를 잃지 않는다", async () => {
    await expect(보낸참조({ personSource: "uploaded" })).rejects.toThrow();
    expect(llm호출).toBeGreaterThan(0);
  });
});
