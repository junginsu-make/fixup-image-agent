# 검색 서비스 등록 안내

FormWith(https://formwith.fix-up.kr)를 네이버, 구글, 다음 검색에 알리는 방법입니다.
앞부분은 운영자용, 뒷부분(개발자용)은 값을 넣는 자리와 새 화면을 만들 때의 규칙입니다.

비유하면 가게를 지도 앱에 올리는 일과 같습니다. 가게 주인이 맞다는 확인(소유 확인)을 받아야
간판과 약도(사이트 지도)를 올릴 수 있습니다.

## 운영자용

### 전체 순서

| 순서 | 누가 | 할 일 |
|------|------|-------|
| 1 | 운영자 | 세 곳에 사이트를 등록하고, 각 곳이 알려주는 확인 값을 복사한다 |
| 2 | 운영자 | 복사한 값 셋을 개발자에게 보낸다 |
| 3 | 개발자 | 값을 코드에 넣고 한 번 배포한다 |
| 4 | 운영자 | 세 곳에서 「확인」(소유확인)을 누른다 |
| 5 | 운영자 | 사이트 지도를 제출하고, 수집(색인)을 요청한다 |

3번 배포가 끝나기 전에 「확인」을 누르면 실패합니다. 값이 아직 사이트에 없기 때문입니다.

### 1. 네이버 서치어드바이저

1. searchadvisor.naver.com 에 접속해 로그인한다
2. 웹마스터 도구 → 사이트 등록에서 `https://formwith.fix-up.kr` 을 넣는다
3. 소유확인 방식은 「HTML 태그」를 고른다
4. 나온 태그에서 `content="..."` 안의 값만 복사한다 (이 값이 `naver`)

### 2. 구글 서치 콘솔

1. search.google.com/search-console 에 접속해 로그인한다
2. 속성 추가에서 「URL 접두어」를 고르고 `https://formwith.fix-up.kr` 을 넣는다
3. 소유권 확인 화면에서 「다른 확인 방법」을 열고 「HTML 태그」를 고른다
4. 나온 태그에서 `content="..."` 안의 값만 복사한다 (이 값이 `google`)

### 3. 다음 웹마스터도구

카카오 검색은 다음 검색을 씁니다. 그래서 다음에도 등록해야 합니다.

1. webmaster.daum.net 에 접속해 로그인한다
2. 사이트 등록에서 `https://formwith.fix-up.kr` 을 넣는다
3. 확인 방식은 robots.txt 방식(PIN 한 줄)을 고른다
4. `#DaumWebMasterTool:` 로 시작하는 한 줄을 통째로 복사한다 (이 값이 `daumPin`)

### 4. 배포 뒤에 누를 것

개발자가 배포했다고 알려주면 아래 순서로 합니다.

| 곳 | 할 일 |
|----|-------|
| 네이버 | 소유확인 버튼 → 요청 > 사이트맵 제출 → 요청 > 웹 페이지 수집 |
| 구글 | 확인 버튼 → Sitemaps 에 제출 → URL 검사 → 색인 생성 요청 |
| 다음 | 확인 버튼 → 사이트맵 제출, 수집 요청 |

- 사이트 지도 주소(세 곳 모두 같음): `https://formwith.fix-up.kr/sitemap.xml`
- 수집(색인) 요청할 화면: 첫 화면, `/about`(소개), `/guide`(사용 설명서)
- 네이버에서는 검증 > robots.txt 로 `https://formwith.fix-up.kr/robots.txt` 가 읽히는지 볼 수 있다

### 기대할 것

- 검색에 실제로 뜨기까지 며칠에서 몇 주 걸립니다. 바로 안 보여도 고장이 아닙니다.
- 「웹사이트」 영역에 보일지는 각 검색 서비스가 정합니다. 우리가 할 수 있는 일은 정보를 바르게 주는 것까지입니다.

### 광고 링크

광고에서 사이트로 연결할 때는 주소 뒤에 출처를 붙입니다.

```
https://formwith.fix-up.kr/?utm_source=…&utm_medium=…&utm_campaign=…
```

대표 주소(canonical)는 항상 꼬리표 없는 주소로 유지됩니다. 그래서 검색 서비스가 광고용 주소를
따로 검색 결과에 올리지 않습니다.

## 개발자용

### 확인 값을 넣는 자리

`apps/web/lib/seo/site.ts` 의 `SEARCH_VERIFICATION`.

| 키 | 넣을 값 |
|----|---------|
| `google` | 태그의 `content` 값만 |
| `naver` | 태그의 `content` 값만 |
| `daumPin` | `#DaumWebMasterTool:` 로 시작하는 robots.txt 한 줄 전체 |

- 빈 문자열이면 그 태그나 줄을 만들지 않는다
- `daumPin` 형식이 틀리면 robots.txt 생성이 에러를 던진다. 테스트가 잡는다
- 값을 넣은 뒤 `docs/DEPLOY.md` 의 「매 배포」대로 배포한다 (SQL 없음)

### 어디서 무엇이 만들어지나

| 결과물 | 만드는 곳 |
|--------|-----------|
| robots.txt | `apps/web/app/robots.txt/route.ts` ← `apps/web/lib/seo/robots.ts` |
| 사이트 지도 | `apps/web/app/sitemap.ts` ← `apps/web/lib/seo/sitemap.ts` (첫 화면, `/about`, 설명서 목차) |
| 화면별 제목·설명 문구 | `apps/web/lib/seo/copy.ts` |
| 메타 태그 도우미 | `apps/web/lib/seo/metadata.ts` |

### 새 화면을 만들 때

- 공개 화면: `lib/seo/copy.ts` 에 문구를 추가한다
- 사용 설명서 화면: 목차 `apps/web/app/guide/_components/topics.ts` 에 넣으면 사이트 지도에 저절로 들어간다
- 회원 전용 화면: `lib/seo/robots.ts` 의 `PRIVATE_PREFIXES` 에 주소 앞부분을 추가해 검색에서 뺀다

### 배포 뒤 확인

```
curl -A "Yeti" https://formwith.fix-up.kr/robots.txt
curl https://formwith.fix-up.kr/sitemap.xml
```

robots.txt 에 `Sitemap:` 줄이 있고, 사이트 지도가 XML 로 열리면 정상입니다.
