"""Read-only UI smoke. Requires Python Playwright; never calls image generation.

Example: py -3.13 docs/cost-lab/verify-forecast-browser.py --url http://localhost:3017/admin/cost-lab/doc/index.html
The server should use LOCAL_STORE=1 and local-only authentication bypass.
"""
import argparse
import json
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default=(Path(__file__).resolve().parents[2] / "apps/web/app/admin/cost-lab/assets/index.html").as_uri())
    parser.add_argument("--chromium")
    args = parser.parse_args()
    output = Path(tempfile.mkdtemp(prefix="mcs-cost-forecast-"))
    checks = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, **({"executable_path": args.chromium} if args.chromium else {}))
        page = browser.new_page(viewport={"width": 1440, "height": 1080}, accept_downloads=True)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(args.url, wait_until="domcontentloaded")
        page.locator("#fc-example").click()
        assert page.locator("#fc-images").inner_text() == "1,120장"
        page.locator('#fc-main-inputs [data-fc-path="groups.0.members"]').fill("123")
        page.wait_for_timeout(250)
        assert page.locator("#fc-images").inner_text() == "1,376장"
        before = page.locator("#fc-cost").inner_text()
        page.locator("#fc-selection").select_option("recommended")
        page.wait_for_timeout(250)
        assert page.locator("#fc-cost").inner_text() != before
        checks.append("member rounding and recommended pricing")

        page.locator("#fc-details>summary").click()
        page.locator("#fc-config>details").nth(0).locator("summary").click()
        page.locator('[data-fc-path="source"]').select_option("main")
        page.wait_for_timeout(200)
        assert "제안" in page.locator("#fc-basis").inner_text()
        page.locator('[data-fc-path="source"]').select_option("wallet")
        page.wait_for_timeout(200)
        assert "1크레딧=1원" in page.locator("#fc-basis").inner_text()
        page.locator('[data-fc-path="source"]').select_option("current")
        page.wait_for_timeout(200)
        assert page.locator('#fc-main-inputs [data-fc-path="groups.0.members"]').input_value() == "123"
        assert page.locator("#fc-images").inner_text() == "1,376장"
        checks.append("product switching preserves each input")

        page.locator('#fc-main-inputs [data-fc-path="groups.0.members"]').fill("-1")
        page.wait_for_timeout(200)
        assert page.locator("#fc-error").is_visible()
        page.locator('#fc-main-inputs [data-fc-path="groups.0.members"]').fill("123")
        page.wait_for_timeout(200)
        assert not page.locator("#fc-error").is_visible()
        checks.append("invalid input and recovery")

        # Existing comparison storage and full-session restoration must include the forecast.
        page.locator('[data-go="scenarios"]').first.click()
        page.locator("#scenario-name").fill("통합 검증")
        page.locator("#save").click()
        assert "예측 월 운영비" in page.locator("#snapshot-table").inner_text()
        page.locator('[data-close="scenarios"]').click()
        page.locator('#fc-main-inputs [data-fc-path="groups.0.members"]').fill("500")
        page.wait_for_timeout(200)
        page.locator('[data-go="scenarios"]').first.click()
        page.locator('[data-load="0"]').click()
        assert page.locator('#fc-main-inputs [data-fc-path="groups.0.members"]').input_value() == "123"
        checks.append("comparison v3 save and restore")

        with page.expect_download() as downloaded:
            page.locator("#download").click()
        html = output / "roundtrip.html"
        downloaded.value.save_as(html)
        offline = browser.new_page()
        offline.on("pageerror", lambda error: errors.append(str(error)))
        offline.goto(html.as_uri())
        assert offline.locator("#fc-images").inner_text() == "1,376장"
        assert offline.locator("#fc-selection").input_value() == "recommended"
        checks.append("offline HTML round trip")

        # Full v3 data is also present in a fragment, including when UI sharing falls back to a file.
        payload = page.evaluate("sessionPayload()")
        encoded = page.evaluate("encodeSession(sessionPayload())")
        restored = browser.new_page()
        restored.goto(args.url.split("#")[0] + "#c=" + encoded)
        assert restored.locator("#fc-images").inner_text() == "1,376장"
        assert payload["version"] == 3
        checks.append("fragment round trip")

        page.locator("#fc-details").evaluate("element => element.open = false")
        for width in [1440, 1024, 390]:
            page.set_viewport_size({"width": width, "height": 1080})
            assert not page.evaluate("document.documentElement.scrollWidth > innerWidth"), width
            page.screenshot(path=str(output / f"light-{width}.png"), full_page=True)
        page.evaluate("document.documentElement.classList.add('dark')")
        page.screenshot(path=str(output / "dark-390.png"), full_page=True)
        page.locator("#fc-details>summary").click()
        for section in page.locator("#fc-config>details").all():
            section.evaluate("element => element.open = true")
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth")
        ids = page.locator("[id]").evaluate_all("elements => elements.map(element => element.id)")
        assert len(ids) == len(set(ids))
        checks.append("mobile, dark, expanded forms and unique labels")
        assert not errors, errors
        browser.close()
    print(json.dumps({"passed": checks, "screenshots": str(output), "javascriptErrors": errors}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
