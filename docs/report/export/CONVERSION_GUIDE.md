# MediSync: Technical Report Export & Document Conversion Guide

This guide provides step-by-step instructions for the student owner to convert `docs/report/TECHNICAL_REPORT.md` into polished **PDF** and **Microsoft Word (DOCX)** documents for final university capstone submission.

---

## 1. Pre-Conversion Checklist (Fill In Placeholders)
Before generating your final submission document, open `docs/report/TECHNICAL_REPORT.md` and replace the following bracketed `[OWNER: ...]` placeholders:
1. **Title Page**:
   - `[OWNER: Student Name]`: Your full name as registered with the university.
   - `[OWNER: Student Registration / Index Number]`: Your student ID / registration number.
   - `[OWNER: University / Faculty of Computing / Department of Software Engineering]`: Your institution name.
   - `[OWNER: Supervisor Names]`: Academic and industrial supervisor names and credentials.
2. **University Template Assets**:
   - Insert your official university crest / faculty logo on the first page.
   - Insert declaration of original work and signature blocks if required by your department.
3. **Citations & References**:
   - Replace `[OWNER: Insert official MOH Annual Health Bulletin 2023 / Census 2024 citations]` with exact reference numbers.

---

## 2. Conversion Methods

### Method A: VS Code Extension (Easiest & Fastest, No Command Line Required)
If you are working in Visual Studio Code:
1. Open the **Extensions** tab (`Ctrl+Shift+X`).
2. Search for and install:
   - **Markdown PDF** (by *yzane*) OR **Markdown All in One** (by *Yu Zhang*).
3. Open `docs/report/TECHNICAL_REPORT.md`.
4. Right-click anywhere in the editor window and select:
   - `Markdown PDF: Export (pdf)` -> Generates `TECHNICAL_REPORT.pdf` in the same directory.
   - `Markdown PDF: Export (docx)` -> Generates `TECHNICAL_REPORT.docx`.
5. *(Optional styling)*: To include page numbers, headers, and footers, configure VS Code settings:
   ```json
   "markdown-pdf.displayHeaderFooter": true,
   "markdown-pdf.headerTemplate": "<div style=\"font-size: 9px; margin-left: 1cm; color: #666;\">MediSync — Final Capstone Engineering Report</div>",
   "markdown-pdf.footerTemplate": "<div style=\"font-size: 9px; margin-right: 1cm; text-align: right; color: #666;\">Page <span class=\"pageNumber\"></span> of <span class=\"totalPages\"></span></div>"
   ```

---

### Method B: Pandoc (Industry Standard for Clean Academic Typography)
If you install `pandoc` on your local computer (`winget install JohnMacFarlane.Pandoc` on Windows, or `brew install pandoc` on macOS):

#### 1. Direct Export to Microsoft Word (DOCX):
```powershell
pandoc docs/report/TECHNICAL_REPORT.md -o docs/report/export/MediSync_Technical_Report.docx --toc --toc-depth=3
```
*(Tip: You can supply your faculty's official Word template via `--reference-doc=university_template.docx` to automatically format all headings, fonts, and margins).*

#### 2. Direct Export to PDF (via XeLaTeX / wkhtmltopdf):
```powershell
pandoc docs/report/TECHNICAL_REPORT.md -o docs/report/export/MediSync_Technical_Report.pdf --pdf-engine=xelatex --toc --number-sections -V geometry:margin=1in
```

---

### Method C: Microsoft Word Direct Import (Best for Faculty Word Templates)
1. Open Microsoft Word.
2. Click **File** -> **Open** -> select `docs/report/TECHNICAL_REPORT.md`. (Word natively parses Markdown in modern versions).
3. Alternatively, open the markdown file in a browser or Markdown previewer, select all (`Ctrl+A`), copy (`Ctrl+C`), and paste (`Ctrl+V`) into your faculty's official `.docx` template.
4. Word will automatically convert headings, code blocks, lists, and tables into styled Word elements.
5. Apply the official university cover page, update the automatic Table of Contents (`F9`), and save as `MediSync_Final_Technical_Report.docx` and `.pdf`.

---

## 3. Embedding Figures & Diagrams
- **Publication Figures (F01 to F14)**:
  All figures are stored at 200 DPI in `docs/report/figures/` (`f01_confusion_matrix.png` through `f14_trilingual_parity.png`). When opening the converted DOCX in Word, confirm that each figure image displays cleanly with its regulatory footer visible.
- **Architecture Diagrams (D01 to D09)**:
  All diagrams are saved as Mermaid source files in `docs/report/diagrams/`. If your markdown renderer does not automatically compile Mermaid diagrams, you can render them to high-resolution PNGs at [mermaid.live](https://mermaid.live) by pasting the `.mmd` contents, downloading the PNG, and inserting it into your final document.

---

## 4. Verification Check Before Printing / Submission
- [ ] Cover page details (Student name, index number, supervisor names) populated.
- [ ] Regulatory disclaimer (`clinicalValidation: not_established`) clearly visible in Abstract and Chapter 6.
- [ ] 15/15 Protected ledger hashes match Appendix B.
- [ ] Table of contents page numbers refreshed.
- [ ] Output PDF file size verified (recommended: under 25 MB).
