from pathlib import Path
import fitz

source = Path("attached_assets/Report_v1.0.10_1795421370052.pdf")
output = Path(".agents/outputs/mobsf-report")
output.mkdir(parents=True, exist_ok=True)

document = fitz.open(source)
print(f"Pages: {document.page_count}")
for index, page in enumerate(document, start=1):
    text_path = output / f"page-{index}.txt"
    image_path = output / f"page-{index}.png"
    text_path.write_text(page.get_text("text"), encoding="utf-8")
    pixmap = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
    pixmap.save(image_path)
    print(f"{index}: {text_path} | {image_path} | {len(page.get_text('text'))} chars")
