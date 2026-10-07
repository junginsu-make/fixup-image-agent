"""개발 일지(docs/devlog)를 GitHub 기록에서 다시 만든다.

저장소 맨 위에서:  python -X utf8 docs/devlog/build.py [미리보기용 본문 파일]

gh(로그인 된 GitHub CLI)와 git 으로 합친 작업 묶음·릴리스·저장 기록을 모아
index.html(브라우저로 여는 판)과 README.md(GitHub 에서 읽는 판)를 쓴다.

사람이 쓰는 것은 둘이다 (절차는 저장소 CLAUDE.md 「개발 일지」).
- weeks.json        주마다 제목·한 줄·요약. 작업 묶음이 있는 주에 제목이 없으면 멈춘다
- entries/*.json    운영 배포 한 번에 한 파일. 그 배포의 쉬운 말 요약이 그 주 요약 뒤에 붙는다
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
# 배포 뒤 일지만 고친 PR(제목 docs(devlog):)은 작업 묶음으로 세지 않는다
prs = [p for p in prs if not p["title"].startswith("docs(devlog)")]
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

WEEKS = json.loads((HERE / "weeks.json").read_text(encoding="utf-8"))


def bad(msg):
    sys.exit(f"개발 일지를 만들지 못했습니다: {msg}")


def load_entry(f):
    try:
        e = json.loads(f.read_text(encoding="utf-8"))
    except json.JSONDecodeError as err:
        bad(f"{f.name} 이 JSON 이 아닙니다 ({err})")
    if not isinstance(e, dict):
        bad(f"{f.name} 은 {{...}} 하나여야 합니다")
    d = e.get("date")
    try:
        date.fromisoformat(d)
    except (TypeError, ValueError):
        bad(f"{f.name} 의 date 는 2026-10-07 꼴이어야 합니다")
    if not f.name.startswith(d + "-"):
        bad(f"{f.name} 의 이름은 date({d}) 로 시작해야 합니다")
    if not isinstance(e.get("release"), str) or not e["release"].strip():
        bad(f"{f.name} 에 배포한 릴리스 id(release)가 없습니다")
    prs_ = e.get("prs")
    if not isinstance(prs_, list) or not all(isinstance(n, int) and not isinstance(n, bool) for n in prs_):
        bad(f"{f.name} 의 prs 는 PR 번호 목록이어야 합니다 (예: [259])")
    pts = e.get("points")
    if not isinstance(pts, list) or not pts or not all(isinstance(t, str) and t.strip() for t in pts):
        bad(f"{f.name} 에 쉬운 말 요약(points)이 한 줄 이상 있어야 합니다")
    return {"date": d, "release": e["release"].strip(), "prs": prs_, "points": [t.strip() for t in pts]}


ENTRIES = sorted((load_entry(f) for f in (HERE / "entries").glob("*.json")),
                 key=lambda e: (e["date"], e["release"]))
deployed_on = {}
for e in ENTRIES:
    for n in e["prs"]:
        deployed_on.setdefault(n, e["date"][5:])

commit_dates = git("log", "origin/master", "--no-merges", "--format=%aI").split()
first_commit = git("log", "origin/master", "--reverse", "--format=%as", "--max-parents=0").split()[0]

weeks = {}


def wk(d):
    k = week_start(d).isoformat()
    return weeks.setdefault(k, {"start": k, "prs": [], "releases": 0, "commits": 0, "deploys": []})


for p in prs:
    d = kst(p["mergedAt"])
    wk(d)["prs"].append({
        "n": p["number"], "t": p["title"], "d": d.strftime("%m-%d"),
        "a": areas_of(p["title"]), "add": p["additions"], "del": p["deletions"],
        "dep": deployed_on.get(p["number"]),
    })
for r in rels:
    wk(kst(r["createdAt"]))["releases"] += 1
for c in commit_dates:
    wk(datetime.fromisoformat(c).astimezone(KST))["commits"] += 1
for e in ENTRIES:
    wk(datetime.fromisoformat(e["date"]))["deploys"].append(e)

week_list = []
for k in sorted(weeks):
    w = weeks[k]
    w["prs"].sort(key=lambda x: (x["d"], x["n"]))
    s = date.fromisoformat(k)
    w["end"] = (s + timedelta(days=6)).isoformat()
    summary = WEEKS.get(k)
    if not summary or not summary.get("title") or not summary.get("lede"):
        bad(f"weeks.json 에 {k} 주의 title·lede 가 없습니다. 그 주 제목과 한 줄 요약을 먼저 적으세요")
    points = list(summary.get("points", []))
    for e in w["deploys"]:
        points += [t for t in e["points"] if t not in points]
    w.update(title=summary["title"], lede=summary["lede"], points=points)
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
    "deployCount": len(ENTRIES),
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
    if w["deploys"]:
        md += ["", f"**운영 배포 {len(w['deploys'])}회**", ""]
        for e in w["deploys"]:
            links = ", ".join(f"[#{n}]({url}/pull/{n})" for n in e["prs"])
            md.append(f"- {md_short(e['date'][5:])} `{md_text(e['release'])}`" + (f" · {links}" if links else ""))
    md += ["", f"<details><summary>이 주의 작업 묶음 {len(w['prs'])}개</summary>", ""]
    day = None
    for p in w["prs"]:
        if p["d"] != day:
            day = p["d"]
            md += ["", f"**{md_short(day)}**", ""]
        tags = " · ".join(label[a] for a in p["a"])
        dep = f" · 운영 반영 {md_short(p['dep'])}" if p.get("dep") else ""
        md.append(f"- [#{p['n']}]({url}/pull/{p['n']}) {md_text(p['t'])} <sub>{tags} · +{p['add']:,} / −{p['del']:,}{dep}</sub>")
    if w.get("early"):
        md += ["", "**작업 묶음 방식 이전의 저장 기록 (큰 줄기만)**", ""]
        md += [f"- {md_short(e['d'])} {md_text(e['t'])}" for e in w["early"]]
    md += ["", "</details>"]
md += ["", "---", "",
       f"자료: GitHub 저장소의 기록을 {md_date(data['asOf'])}에 모았습니다. 날짜는 한국 시각, 한 주는 월요일부터입니다. "
       "배포 꾸러미는 만들어진 수이며 실제로 운영에 올린 횟수와 다릅니다.",
       "",
       "다시 만들기: 저장소 맨 위에서 `python -X utf8 docs/devlog/build.py` "
       "(GitHub CLI 로그인 필요). 주 제목·요약은 `weeks.json`, 운영 배포 기록은 `entries/` 에 적습니다.",
       ""]
(HERE / "README.md").write_text("\n".join(md), encoding="utf-8")

etc = [(p["n"], p["t"]) for w in week_list for p in w["prs"] if p["a"] == ["etc"]]
print("weeks", len(week_list), "prs", len(prs), "deploys", len(ENTRIES), "days", data["days"], "unclassified", len(etc))
