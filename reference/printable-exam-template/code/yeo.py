"""YouEngage OET printable-exam template (ReportLab).

Reproduces the "PAPER EXAM 1" booklets: branded cover with candidate block and
bubble grids, navy banners, Part A / B / C pages, bubble-answer multiple choice.

Use:  from yeo import *   (see build_learn1.py for a worked example)
All measurements are in points on A4 (595.3 x 841.9).
"""
import os
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table,
                                TableStyle, PageBreak, KeepTogether, NextPageTemplate, Flowable, HRFlowable)

W, H = A4
NAVY = colors.HexColor("#00397D")
TINT = colors.HexColor("#E5EFF9")
GREY = colors.HexColor("#555555")
LOGO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logo.png")
FOOTER = "YouEngage OET Training Centre  ·  Olympia, Lusaka  ·  Original practice material – not an official OET test"

_b = getSampleStyleSheet()["Normal"]
BASE = ParagraphStyle("base", parent=_b, fontName="Helvetica", fontSize=9, leading=13)
SMALL = ParagraphStyle("small", parent=BASE, fontSize=8.5, leading=12)
BOLD = ParagraphStyle("bold", parent=BASE, fontName="Helvetica-Bold")
CENTER_H = ParagraphStyle("ch", parent=BASE, fontName="Helvetica-Bold", fontSize=10.5, alignment=1, spaceAfter=8)
H_Q = ParagraphStyle("hq", parent=BASE, fontName="Helvetica-Bold", fontSize=10.5, spaceBefore=8, spaceAfter=3)
BODY = ParagraphStyle("body", parent=BASE, fontSize=9.5, leading=15, spaceAfter=7)
TEXT_TITLE = ParagraphStyle("tt", parent=BASE, fontName="Helvetica-Bold", fontSize=9.5, leading=13, spaceAfter=3)


# ------------------------------------------------------------------ page chrome
def _footer(c, label=FOOTER):
    c.setFont("Helvetica", 6.5)
    c.setFillColor(GREY)
    c.drawString(40, 41, label)
    c.drawCentredString(W / 2, 28, str(c.getPageNumber()))


def _logo(c, x=40, ytop=34, size=56, box_label=None, subtitle="TRAINING CENTRE  ·  LUSAKA, ZAMBIA"):
    if os.path.exists(LOGO):
        c.drawImage(LOGO, x, H - ytop - size, size, size, mask="auto")
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 17)
    c.drawString(x + 68, H - ytop - 29, "YouEngage OET")
    c.setFont("Helvetica", 8)
    c.drawString(x + 68, H - ytop - 41, subtitle)
    if box_label:
        c.setStrokeColor(colors.black)
        c.setFillColor(colors.black)
        c.setLineWidth(1)
        c.rect(443, H - 65, 113, 29)
        c.setFont("Helvetica-Bold", 7.5)
        c.drawCentredString(499.5, H - 53, box_label)


def _banner(c, title, ytop, h=34, size=15):
    c.setFillColor(NAVY)
    c.rect(40, H - ytop - h, 516, h, stroke=0, fill=1)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", size)
    c.drawString(50, H - ytop - h / 2 - size * 0.35, title)


def _bubbles(c, x0, ytop, cols, pitch_x=18, pitch_y=16, r=5, filled=None):
    for col in range(cols):
        for d in range(10):
            cx, cy = x0 + col * pitch_x, H - ytop - d * pitch_y
            c.setLineWidth(0.5)
            c.setStrokeColor(colors.black)
            c.circle(cx, cy, r, stroke=1, fill=1 if (filled and filled.get(col) == d) else 0)
            if not (filled and filled.get(col) == d):
                c.setFont("Helvetica", 5.5)
                c.setFillColor(colors.black)
                c.drawCentredString(cx, cy - 2, str(d))
            c.setFillColor(colors.black)


def draw_cover(c, d, cfg):
    """cfg keys: title, box_label, score_max, time_line, mode ('timed'|'untimed'), instructions (list of html strings)"""
    c.saveState()
    _logo(c, box_label=cfg["box_label"])
    _banner(c, cfg["title"], 103)
    # outer candidate box
    c.setStrokeColor(colors.black)
    c.setLineWidth(0.8)
    c.rect(40, H - 481, 516, 335)
    c.setFillColor(colors.black)
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(62, H - 176, "CANDIDATE NAME:")
    c.setLineWidth(0.6)
    c.line(155, H - 178, 536, H - 178)
    c.drawString(62, H - 211, "D.O.B.:")
    for i in range(8):
        c.rect(106 + i * 20.3, H - 219, 20.3, 25)
    c.setLineWidth(1)
    c.rect(318, H - 220, 218, 26)
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(326, H - 211, "PROFESSION:")
    c.setFont("Helvetica", 9.5)
    c.drawString(390, H - 211, "Nursing")
    c.rect(62, H - 256, 238, 26)
    c.drawString(0, 0, "")
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(69, H - 246, "VENUE:")
    c.rect(318, H - 256, 218, 26)
    c.drawString(326, H - 246, "TEST DATE:")
    # example grid
    c.setFont("Helvetica", 6.5)
    c.drawString(62, H - 283, "Example:")
    c.drawString(152, H - 270, "Starting at the left, print your Candidate")
    c.drawString(152, H - 278, "Number and fill in the corresponding circle")
    c.drawString(152, H - 286, "below each number using a 2B pencil.")
    c.setLineWidth(0.6)
    c.rect(62, H - 474, 48, 174)
    c.line(86, H - 300, 86, H - 474)
    c.setFont("Helvetica-Bold", 8)
    c.drawCentredString(74, H - 312, "2")
    c.drawCentredString(98, H - 312, "5")
    _bubbles(c, 74, 345, 2, pitch_x=24, pitch_y=13.5, r=4.4, filled={0: 2, 1: 5})
    # candidate number grid
    c.setFillColor(TINT)
    c.rect(152, H - 316, 160, 16, stroke=1, fill=1)
    c.setFillColor(colors.black)
    c.setFont("Helvetica-Bold", 8)
    c.drawCentredString(232, H - 312, "CANDIDATE NUMBER")
    for i in range(8):
        c.rect(152 + i * 20, H - 334, 20, 18)
    _bubbles(c, 162, 345, 8, pitch_x=20, pitch_y=13.5, r=4.4)
    # right-hand notes
    c.setFont("Helvetica-Bold", 7.5)
    head = "TIMED PAPER TEST" if cfg["mode"] == "timed" else "UNTIMED LEARNING TEST"
    c.drawString(318, H - 308, head)
    c.setFont("Helvetica", 7)
    if cfg["mode"] == "timed":
        lines = ["This is a timed, paper-based practice test. Work under", "exam conditions: no dictionaries, phones or notes. Write",
                 "your answers in pencil. Your tutor will mark the test and", "return it with feedback."]
    else:
        lines = ["This is an untimed learning test. There is no time limit:", "take as long as you need. Write your answers in pencil.",
                 "Your tutor will mark the test and return it with", "feedback."]
    for k, ln in enumerate(lines):
        c.drawString(318, H - 320 - k * 9.5, ln)
    c.setFont("Helvetica-Bold", 7.5)
    c.drawString(318, H - 382, "DATE COMPLETED:")
    c.setLineWidth(0.6)
    c.line(318, H - 408, 536, H - 408)
    c.drawString(318, H - 430, "SCORE:")
    c.setFont("Helvetica", 8)
    c.drawString(352, H - 430, "________  /  %s" % cfg["score_max"])
    # time + instructions
    c.setFont("Helvetica-Bold", 8)
    c.drawString(48, H - 497, cfg["time_line"])
    c.setFillColor(NAVY)
    c.rect(40, H - 524, 516, 22, stroke=0, fill=1)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 9.5)
    c.drawString(48, H - 517, "INSTRUCTIONS TO CANDIDATES")
    ih = 20 + sum(14 * max(1, len(p) // 105 + 1) for p in cfg["instructions"])
    c.setFillColor(colors.black)
    c.setLineWidth(0.8)
    c.rect(40, H - 524 - ih, 516, ih)
    y = H - 544
    for p in cfg["instructions"]:
        para = Paragraph(p, ParagraphStyle("i", parent=BASE, fontSize=8.5, leading=11.5))
        w, h = para.wrap(500, 200)
        para.drawOn(c, 48, y - h + 8)
        y -= h + 6
    _footer(c)
    c.restoreState()


def _body_page(c, d):
    c.saveState()
    _footer(c)
    c.restoreState()


def _plain_header_page(c, d, cfg):
    c.saveState()
    _logo(c, size=44, subtitle=cfg.get("subtitle", "TRAINING CENTRE  ·  LUSAKA, ZAMBIA"))
    _banner(c, cfg["title"], 92, h=30, size=14)
    _footer(c)
    c.restoreState()


def make_doc(path, story_fn, cover_cfg=None, header_cfg=None, title="", cover_after=None):
    """Create a booklet. cover_cfg -> branded candidate cover. header_cfg -> plain logo+banner first page (text booklet)."""
    doc = BaseDocTemplate(path, pagesize=A4, title=title, author="YouEngage OET Training Centre")
    body = Frame(40, 62, 516, H - 62 - 52, id="b", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    first = Frame(40, 62, 516, H - 62 - 150, id="f", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    tpls = [PageTemplate(id="body", frames=[body], onPage=_body_page)]
    story = []
    if cover_cfg:
        tpls.insert(0, PageTemplate(id="cover", frames=[Frame(40, 62, 516, 100, id="c")], onPage=lambda c, d: draw_cover(c, d, cover_cfg)))
        story += [Spacer(1, 1), NextPageTemplate("body"), PageBreak()]
    elif header_cfg:
        tpls.insert(0, PageTemplate(id="head", frames=[first], onPage=lambda c, d: _plain_header_page(c, d, header_cfg)))
        story += [NextPageTemplate("body")]
    doc.addPageTemplates(tpls)
    doc.build(story + story_fn())


# ------------------------------------------------------------------ flowables
class Bubble(Flowable):
    """Row of lettered answer circles."""
    def __init__(self, letters="ABC"):
        super().__init__()
        self.letters = letters
    def wrap(self, aw, ah):
        return 100, 12
    def draw(self):
        c = self.canv
        for i, L in enumerate(self.letters):
            c.setLineWidth(0.6)
            c.circle(6 + i * 18, 6, 5)
            c.setFont("Helvetica", 6.5)
            c.drawCentredString(6 + i * 18, 3.6, L)


def bullets(items, style=SMALL):
    return [Paragraph(t, ParagraphStyle("bu", parent=style, leftIndent=12, bulletIndent=2, spaceAfter=2), bulletText="•") for t in items]


def rule(w="100%", t=1.2, space=6):
    return HRFlowable(width=w, thickness=t, color=colors.black, spaceBefore=space, spaceAfter=space)


def text_box(label, title, blocks):
    """Navy-tab text box used in the Part A text booklet. blocks: list of ('h'|'p'|'b', text) or ('bl', [items])."""
    inner = [Paragraph("<b>%s</b>" % title, ParagraphStyle("t", parent=BASE, fontSize=9.5, leading=13, spaceAfter=5))]
    for kind, val in blocks:
        if kind == "h":
            inner.append(Paragraph("<b>%s</b>" % val, ParagraphStyle("h", parent=BASE, fontSize=9.2, leading=12.5, spaceBefore=5, spaceAfter=1)))
        elif kind == "p":
            inner.append(Paragraph(val, ParagraphStyle("p", parent=BASE, fontSize=9, leading=13, spaceAfter=3)))
        elif kind == "bl":
            inner += bullets(val, ParagraphStyle("bq", parent=BASE, fontSize=9, leading=13))
    box = Table([[inner]], colWidths=[516])
    box.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.9, colors.black), ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                             ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
    tab = Table([[Paragraph('<font color="white"><b>%s</b></font>' % label, ParagraphStyle("tab", parent=BASE, fontSize=8.5))]], colWidths=[50])
    tab.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), NAVY), ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3), ("LEFTPADDING", (0, 0), (-1, -1), 6)]))
    tab.hAlign = "LEFT"
    return KeepTogether([tab, box, Spacer(1, 12)])


def mc_question(n, stem, options, letters=None, qstyle=None):
    """Numbered MC with answer bubbles (Part B/C)."""
    letters = letters or "ABCD"[: len(options)]
    rows = [[Paragraph("<b>%s.</b>" % n, BASE), Paragraph("<b>%s</b>" % stem, BASE)]]
    for L, o in zip(letters, options):
        rows.append([Bubble(L), Paragraph(o, BASE)])
    t = Table(rows, colWidths=[28, 488])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    return KeepTogether([t, Spacer(1, 8)])


def extract_box(title, sender, body):
    head = "<b>%s</b>" % title + (("<br/>" + (sender if sender.startswith("From:") else "From: " + sender)) if sender else "")
    t = Table([[Paragraph(head, BASE)], [Paragraph(body, BASE)]], colWidths=[516])
    t.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.9, colors.black), ("LINEBELOW", (0, 0), (-1, 0), 0.9, colors.black), ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                           ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8)]))
    return t


def fill_circle_note(letters="ABC", example="B"):
    """The 'Fill the circle in completely. Example: (A) (B) (C)' strip."""
    class _N(Flowable):
        def wrap(self, aw, ah): return 516, 16
        def draw(self):
            c = self.canv
            c.setFont("Helvetica", 7); c.drawRightString(440, 4, "Fill the circle in completely.")
            c.setFont("Helvetica-Bold", 7); c.drawString(452, 4, "Example:")
            for i, L in enumerate(letters):
                cx = 495 + i * 15
                c.setLineWidth(0.6); c.circle(cx, 6, 4.4, stroke=1, fill=1 if L == example else 0)
                if L != example:
                    c.setFont("Helvetica", 6); c.drawCentredString(cx, 3.8, L)
    return [_N(), HRFlowable(width="100%", thickness=0.8, color=colors.black, spaceBefore=1, spaceAfter=8)]


def blank_line():
    return "______________"
