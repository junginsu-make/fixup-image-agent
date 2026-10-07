"""개발 일지(docs/devlog)를 GitHub 기록에서 다시 만든다.

저장소 맨 위에서:  python -X utf8 docs/devlog/build.py [미리보기용 본문 파일]

gh(로그인 된 GitHub CLI)와 git 으로 합친 작업 묶음·릴리스·저장 기록을 모아
index.html(브라우저로 여는 판)과 README.md(GitHub 에서 읽는 판)를 쓴다.
주별 요약은 사람이 쓴다 — 새 주가 생기면 SUMMARIES 에 한 칸 더한다.
"""
import json, sys, subprocess, pathlib
from datetime import datetime, timedelta, timezone, date

HERE = pathlib.Path(__file__).resolve().parent
REPO = str(HERE.parent.parent)
KST = timezone(timedelta(hours=9))
BS = chr(92)


def run(*args):
    out = subprocess.run(list(args), capture_output=True, text=True, encoding="utf-8", cwd=REPO)
    if out.returncode != 0:
        sys.exit(f"{args[0]} 실패: {out.stderr.strip()}")
    return out.stdout


def git(*args):
    return run("git", *args)


git("fetch", "-q", "origin")
prs = json.loads(run("gh", "pr", "list", "--state", "merged", "--limit", "5000",
                     "--json", "number,title,mergedAt,additions,deletions"))
rels = json.loads(run("gh", "release", "list", "--limit", "5000", "--json", "tagName,createdAt"))


def kst(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(KST)


def week_start(d):
    return (d - timedelta(days=d.weekday())).date()


AREAS = [
    ("analytics", "방문 분석", ["analytics", "방문 분석"]),
    ("seo", "검색 노출", ["seo", "검색 정보"]),
    ("sns", "카드뉴스", ["sns", "카드뉴스"]),
    ("poster", "이미지 만들기", ["poster", "포스터", "이미지 만들기", "(기획)", "첨부"]),
    ("pdp", "상세페이지", ["pdp", "상세페이지"]),
    ("redesign", "리디자인", ["redesign", "리디자인"]),
    ("character", "캐릭터", ["character", "캐릭터", "각도"]),
    ("easy", "쉽게 모드", ["easy", "쉽게"]),
    ("ad", "광고 규격", ["(ad", "광고"]),
    ("credit", "크레딧·비용", ["credit", "크레딧", "cost", "비용", "장부", "ai-control", "구독", "membership", "한도", "과금"]),
    ("auth", "회원·로그인", ["auth", "account", "member", "settings", "access", "인증", "로그인", "가입", "탈퇴", "회원"]),
    ("admin", "관리자", ["admin", "관리자"]),
    ("security", "보안", ["security", "보안", "취약점", "deps", "남의 데이터", "리다이렉트", "올린 사람만", "바깥 사이트", "우회"]),
    ("infra", "배포·서버", ["deploy", "ci:", "(ci", "인프라", "배포", "100명", "perf", "fal", "워커", "릴리스"]),
    ("landing", "첫 화면", ["landing", "home", "첫 화면", "히어로", "hero", "휠", "푸터", "공유", "글꼴", "슬로건", "header", "mcs 란", "지워진 글자"]),
    ("library", "라이브러리", ["library", "라이브러리", "reference", "참고 이미지", "미리보기", "백필", "rerun", "과정", "레퍼런스", "작업물", "남의 작업"]),
    ("guide", "설명서·도우미", ["guide", "설명서", "(cs", "도우미"]),
    ("legal", "약관", ["legal", "약관", "처리방침", "권리", "exif", "ai 생성 표시"]),
    ("team", "팀", ["team", "팀"]),
    ("studio", "작업 화면", ["studio", "shell", "layout", "(ui", "사이드바", "상단바", "단계 막대", "패널", "지우기 단추"]),
]


def areas_of(title):
    t = title.lower()
    found = [k for k, _, kws in AREAS if any(w in t for w in kws)]
    return found or ["etc"]


SUMMARIES = {
    "2026-08-31": {
        "title": "씨앗을 심고 도구들의 뼈대를 세운 주",
        "lede": "기존 상세페이지 제작 도구를 씨앗 삼아 새 저장소를 열고, 나흘 만에 카드뉴스·이미지 만들기·캐릭터·라이브러리의 기본 흐름을 세웠습니다.",
        "points": [
            "8월 31일, 기존 「detail-page-studio」를 씨앗으로 저장소를 시작했습니다.",
            "카드뉴스는 「몇 장인지 자리 계산, 기획, 원고, 그림, 사람이 검수」 순서로 처음부터 만들었습니다.",
            "포스터(뒤에 「이미지 만들기」로 넓힘)와 캐릭터, 참고 이미지를 모아 두는 라이브러리를 붙였습니다.",
            "9월 3일부터 작업을 「작업 묶음」 단위로 검토하고 합치기 시작했습니다.",
            "9월 4일 첫 화면을 공개용으로 개편하고, 틀이 고정된 카드뉴스를 더했습니다.",
            "목록이 원본 대신 작은 미리보기를 받아 빨라졌습니다. 원본 화질은 그대로 둡니다.",
            "주말에는 포털 광고 소재 규격 작업을 시작했습니다.",
        ],
    },
    "2026-09-07": {
        "title": "광고·팀·크레딧이 붙고 배포 방식이 자리 잡은 주",
        "lede": "만든 그림을 포털 광고 규격으로 뽑는 기능이 완성되고, 사용량을 실제 돈과 묶는 장부가 들어왔습니다.",
        "points": [
            "광고 규격 자동 생성을 4단계에 걸쳐 완성해, 필수 광고 소재 9개를 한 번에 만듭니다.",
            "팀 작업 공간을 만들었습니다. (9월 22일에 화면에서는 숨김)",
            "이미지 만들기에 첨부 그림 번호와 「사람은 그대로, 그림 느낌만」 같은 역할을 붙였습니다.",
            "다섯 도구 모두 사용량을 실제 비용에 맞춰 장부에 적기 시작했습니다.",
            "9월 9일 상세페이지를 크게 손보고, Next.js 의 원격 실행 보안 구멍 둘을 막았습니다.",
            "9월 10일 배포 꾸러미를 GitHub 릴리스로 내보내는 지금의 배포 방식이 시작됐고, 첫 화면을 움직이는 그림 캐러셀로 바꿨습니다.",
            "기본 그림 모델을 gpt-image-2.5 로 옮기고, 관리자용 비용 전략실을 들였습니다.",
        ],
    },
    "2026-09-14": {
        "title": "만든 과정을 다시 열고, 쉽게 모드가 태어난 주",
        "lede": "라이브러리에서 지난 작업을 단계별로 다시 열 수 있게 되었고, 말로 주문하는 대화형 화면이 처음 나왔습니다.",
        "points": [
            "작업 화면 왼쪽 메뉴를 접었다 펼 수 있게 했습니다.",
            "저장해 둔 캐릭터에서 원하는 장면을 골라 쓸 수 있습니다.",
            "이미지 만들기를 그림 없이 글만으로도 시작할 수 있게 했습니다.",
            "라이브러리에서 이미지·카드뉴스·상세페이지·캐릭터 작업을 단계별로 다시 열어 봅니다.",
            "지난 단계로 돌아가면 그때 입력한 값이 그대로 들어 있습니다.",
            "그림 서비스가 거절한 경우를 우리 고장처럼 말하지 않게 안내를 바로잡았습니다.",
            "9월 18일 「쉽게(Easy) 모드」, 말로 만드는 대화 화면을 처음 열었습니다.",
        ],
    },
    "2026-09-21": {
        "title": "이름을 FormWith 로 바꾸고 크레딧·구독 체계를 세운 주",
        "lede": "서비스 이름이 MCS 에서 FormWith 로 바뀌고, 구독·구매·만료가 있는 크레딧 장부가 전 회원에게 적용됐습니다.",
        "points": [
            "쉽게 모드를 다른 도구와 같은 화면 틀에 넣고, 대화의 결과를 한 칸에 모았습니다.",
            "사용 설명서를 로그인 없이도 볼 수 있게 했습니다.",
            "9월 22일 상세페이지·리디자인 통합 개선(설계 122건)을 한 번에 반영했습니다.",
            "크레딧 장부에 구독·구매·만료를 넣고, 비용이 새던 자리 넷을 막았습니다.",
            "관리자 화면을 회원 관리·시스템 관리·비용 전략 탭으로 정리했습니다.",
            "계정 화면에 이름·추천인·사용 기록을 더하고, 회원이 직접 탈퇴할 수 있게 했습니다.",
            "로그인 화면이 다른 사람의 세션으로 들여보내던 문제를 고쳤습니다.",
        ],
    },
    "2026-09-28": {
        "title": "출시를 앞두고 도우미·약관·보안·서버를 다진 주",
        "lede": "사람이 몰려도 버티도록 서버를 다지고, 비용이 새지 않게 AI 사용을 통제하고, 간편가입을 열었습니다.",
        "points": [
            "설명서를 근거로 사용법을 답하는 AI 도우미를 붙였습니다.",
            "약관과 개인정보 처리방침을 실제 사업자 정보와 위탁 업체로 채웠습니다.",
            "만든 그림 파일 안에 「AI 생성」 표시를 적습니다.",
            "「100명 대비」 작업으로 메모리 상한, 그림 대기열, 그림 서비스 계정 여러 개 돌려 쓰기, 빠른 로그인 확인을 넣었습니다.",
            "크레딧이 없거나 운영자가 멈추면 돈 드는 AI 를 막고, 호출마다 비용을 적어 관리자 화면에서 봅니다.",
            "Google·카카오 간편가입과 전화번호(선택) 입력을 열었습니다.",
            "쉽게 모드의 채팅에서 카드뉴스를 만들고 손볼 수 있게 했습니다.",
            "남의 그림 위치를 쓰는 길 같은 보안 구멍과 크레딧 우회 길을 막았습니다.",
        ],
    },
    "2026-10-05": {
        "title": "운영을 들여다보는 눈을 단 주",
        "lede": "누가 어떻게 찾아와 무엇을 쓰는지 보는 방문 분석과, 검색 사이트 등록 준비가 들어왔습니다.",
        "points": [
            "조금 작은 옛 그림도 1.2배까지 늘려 광고 규격을 뽑습니다.",
            "로그인 뒤 돌아갈 주소를 악용해 바깥 사이트로 보내지 못하게 막았습니다.",
            "쉽게 모드에서 만든 이미지를 이어서 고칠 수 있습니다.",
            "관리자 「방문 분석」 탭과 쿠키 동의 띠를 열었습니다.",
            "캐릭터 묘사를 AI 가 정리하고, 내 캐릭터를 다른 화풍·체형으로 바꿉니다.",
            "네이버·구글·다음 검색 등록을 위한 검색 정보(사이트 지도 등)를 넣었습니다. 검색 사이트별 확인 값은 아직 넣기 전입니다.",
        ],
    },
}

EARLY = [
    ("08-31", "chore: detail-page-studio 를 씨앗으로 Fixup Image Agent 를 시작한다"),
    ("08-31", "feat(inbox): 수집함 화면을 만든다"),
    ("08-31", "feat(library): 참고 이미지와 묶음 세트를 라이브러리에 넣는다"),
    ("09-01", "feat(sns): 자리 계산 — AI 에게 장수를 묻지 않는다"),
    ("09-01", "feat(sns): 카드 생성 파이프라인"),
    ("09-01", "feat(poster): LLM 이 슬롯을 채우는 기획"),
    ("09-01", "feat(poster): 검수와 변형 선택·수정 루프"),
    ("09-02", "feat: 라이브러리 하나로 모으고 세 도구가 다 끌어다 쓴다"),
    ("09-02", "feat(studio): 대화로 무엇을 만들지 정하는 뼈대"),
    ("09-03", "feat(ui): 포스터 만들기를 이미지 만들기로 넓힌다"),
    ("09-03", "feat(watermark): 만든 그림에 \"AI 이미지\" 를 옅게 새긴다"),
    ("09-03", "feat(character): 사람만 만들던 것을 동물·캐릭터·사물까지 넓힌다"),
    ("09-04", "feat(guide): 앱 안에 사용 설명서를 붙인다"),
]

commit_dates = git("log", "origin/master", "--no-merges", "--format=%aI").split()
first_commit = git("log", "origin/master", "--reverse", "--format=%as", "--max-parents=0").split()[0]

weeks = {}


def wk(d):
    k = week_start(d).isoformat()
    return weeks.setdefault(k, {"start": k, "prs": [], "releases": 0, "commits": 0})


for p in prs:
    d = kst(p["mergedAt"])
    wk(d)["prs"].append({
        "n": p["number"], "t": p["title"], "d": d.strftime("%m-%d"),
        "a": areas_of(p["title"]), "add": p["additions"], "del": p["deletions"],
    })
for r in rels:
    wk(kst(r["createdAt"]))["releases"] += 1
for c in commit_dates:
    wk(datetime.fromisoformat(c).astimezone(KST))["commits"] += 1

week_list = []
for k in sorted(weeks):
    w = weeks[k]
    w["prs"].sort(key=lambda x: (x["d"], x["n"]))
    s = date.fromisoformat(k)
    w["end"] = (s + timedelta(days=6)).isoformat()
    w.update(SUMMARIES.get(k, {
        "title": "요약을 아직 쓰지 않은 주",
        "lede": "이 주의 쉬운 말 요약은 아직 없습니다. 아래 작업 묶음 목록을 펼쳐 보세요.",
        "points": [],
    }))
    if k == "2026-08-31":
        w["early"] = [{"d": d, "t": t} for d, t in EARLY]
    week_list.append(w)

last_pr = max(kst(p["mergedAt"]) for p in prs)
data = {
    "repo": "junginsu-make/fixup-image-agent",
    "asOf": datetime.now(KST).strftime("%Y-%m-%d"),
    "first": first_commit,
    "last": last_pr.strftime("%Y-%m-%d"),
    "days": (last_pr.date() - date.fromisoformat(first_commit)).days + 1,
    "commits": len(commit_dates),
    "prCount": len(prs),
    "releaseCount": len(rels),
    "areas": [{"k": k, "label": l} for k, l, _ in AREAS] + [{"k": "etc", "label": "기타"}],
    "weeks": week_list,
}

blob = json.dumps(data, ensure_ascii=False).replace("<", BS + "u003c")
body = (HERE / "template.html").read_text(encoding="utf-8").replace("__DATA__", blob)
if len(sys.argv) > 1:
    pathlib.Path(sys.argv[1]).write_text(body, encoding="utf-8")
(HERE / "index.html").write_text(
    '<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n'
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n</head>\n<body>\n'
    + body + "\n</body>\n</html>\n",
    encoding="utf-8",
)


def md_text(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("|", "&#124;")


def md_date(iso):
    _, m, d = iso.split("-")
    return f"{int(m)}월 {int(d)}일"


def md_short(mmdd):
    m, d = mmdd.split("-")
    return f"{int(m)}/{int(d)}"


label = {a["k"]: a["label"] for a in data["areas"]}
url = f"https://github.com/{data['repo']}"
md = [
    "# FormWith 개발 일지",
    "",
    f"{md_date(data['first'])} 첫 저장부터 {md_date(data['last'])}까지 **{data['days']}일**, "
    f"작업 묶음(PR) **{data['prCount']}개**, 저장 기록(커밋, 합치기 제외) **{data['commits']:,}개**, "
    f"배포 꾸러미(릴리스) **{data['releaseCount']}개**.",
    "",
    "한 주씩 쉬운 말 요약을 먼저 적고, 그 주의 작업 묶음은 접어 두었습니다. "
    "분야로 거르거나 찾아보려면 이 폴더의 `index.html` 을 내려받아 브라우저로 여세요.",
    "",
    "| 주 | 한 줄 | 작업 묶음 | 저장 기록 | 배포 꾸러미 |",
    "|---|---|---:|---:|---:|",
]
for w in week_list:
    anchor = "w-" + w["start"]
    md.append(f"| [{md_short(w['start'][5:])}](#{anchor}) | {md_text(w['title'])} | {len(w['prs'])} | {w['commits']} | {w['releases']} |")
for w in week_list:
    md += ["", f'<a id="w-{w["start"]}"></a>', "",
           f"## {md_date(w['start'])} ~ {md_date(w['end'])} · {md_text(w['title'])}", "",
           md_text(w["lede"]), ""]
    md += [f"- {md_text(p)}" for p in w["points"]]
    md += ["", f"<details><summary>이 주의 작업 묶음 {len(w['prs'])}개</summary>", ""]
    day = None
    for p in w["prs"]:
        if p["d"] != day:
            day = p["d"]
            md += ["", f"**{md_short(day)}**", ""]
        tags = " · ".join(label[a] for a in p["a"])
        md.append(f"- [#{p['n']}]({url}/pull/{p['n']}) {md_text(p['t'])} <sub>{tags} · +{p['add']:,} / −{p['del']:,}</sub>")
    if w.get("early"):
        md += ["", "**작업 묶음 방식 이전의 저장 기록 (큰 줄기만)**", ""]
        md += [f"- {md_short(e['d'])} {md_text(e['t'])}" for e in w["early"]]
    md += ["", "</details>"]
md += ["", "---", "",
       f"자료: GitHub 저장소의 기록을 {md_date(data['asOf'])}에 모았습니다. 날짜는 한국 시각, 한 주는 월요일부터입니다. "
       "배포 꾸러미는 만들어진 수이며 실제로 운영에 올린 횟수와 다릅니다.",
       "",
       "다시 만들기: 저장소 맨 위에서 `python -X utf8 docs/devlog/build.py` "
       "(GitHub CLI 로그인 필요). 새 주의 요약은 `build.py` 의 `SUMMARIES` 에 적습니다.",
       ""]
(HERE / "README.md").write_text("\n".join(md), encoding="utf-8")

etc = [(p["n"], p["t"]) for w in week_list for p in w["prs"] if p["a"] == ["etc"]]
print("weeks", len(week_list), "prs", len(prs), "commits", len(commit_dates), "days", data["days"], "unclassified", len(etc))
