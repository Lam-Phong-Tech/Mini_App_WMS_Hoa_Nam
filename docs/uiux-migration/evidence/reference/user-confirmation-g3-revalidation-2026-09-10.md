# User confirmation — UIUX-G3 revalidation

**Recorded:** 2026-09-10T00:12:48.7045891+07:00

The user supplied the following confirmation twice in the same message. It is
recorded once here without changing its meaning:

> Tôi cho phép dùng snapshot Designer `86079f965f2fcb43a7e3efbbc9467d119b47921f` chỉ trên local để đối chiếu visual UIUX-G3; không dùng làm dữ liệu runtime, Green, UAT, Customer hoặc Production. Tôi cũng duyệt một QA adapter/fixture cô lập chỉ để kiểm tra các trạng thái empty, loading, append error, unavailable, maintenance, rate-limit, image error và ngưỡng 79/80/81; không gọi quote POST, không ghi sale/CRM và không phát hành dữ liệu fixture. Sau khi đủ evidence, hãy revalidate G3; chỉ mở G4 khi G3 PASS.

## Applied boundary

- The locked Designer checkout is rendered locally only for structural visual
  comparison; its fixture remains outside the Mini App runtime.
- `scripts/run-g3-qa-harness.mjs` creates its data in memory, exposes no quote
  endpoint and stops its local API/Vite processes after test execution.
- Green is used only by the independent local backend-preview visual target.
  No Green write, Customer/Production action, UAT fixture or deployment is
  part of this revalidation.
