-- 문서로 자기 작업을 찾는 길에 붙는 색인 (K-04)
--
-- 탭을 닫았다 돌아온 사용자는 **작업 번호를 모른다.** 번호는 생성 응답에
-- 실려 오는데, 닫고 나간 경우가 바로 그 응답을 못 받은 경우다. 그동안 서버는
-- 그림을 저장소에 올려 두었으므로, 화면이 아는 유일한 것(자기 초안 id)으로
-- 찾아갈 길이 있어야 한다. 설계 §8.1 이 이 표에 document/revision 을 둔 까닭이다.
--
-- 앞선 색인 `pdp_jobs_user_idx(user_id, created_at desc)` 로도 답은 나오지만,
-- 한 사용자의 모든 작업을 훑는다. 초안 하나를 여는 **평범한 화면 진입마다**
-- 도는 질의라 문서로 바로 좁힌다.
--
-- **이 파일은 202609180001 을 고치지 않는다.** 그 파일은 이미 적용됐을 수
-- 있고, 적용된 마이그레이션을 고치면 적용한 곳과 안 한 곳이 갈린다.

create index if not exists pdp_jobs_document_idx
  on public.pdp_generation_jobs(user_id, document_id, revision, created_at desc);
