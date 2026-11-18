"""Reading Parts B and C question-and-answer booklet (template). Usage: python3 build_bc.py text1.txt text2.txt  (paragraphs separated by blank lines)"""
import sys, os
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from learn1_data import B, C1, C2
from yeo import *
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out"); os.makedirs(OUT, exist_ok=True)
EXAM = "LEARNING TEST 1 (UNTIMED)"
def paras(path):
    return [p.replace("\n", " ").strip() for p in open(path, encoding="utf-8").read().split("\n\n") if p.strip()]
t1, t2 = paras(sys.argv[1]), paras(sys.argv[2])
T1, T2 = "Assessing Pain in People with Dementia", "Antimicrobial Resistance: The Role of Nurses"
def story():
    s = [Paragraph("Part B", CENTER_H),
         Paragraph("In this part of the test, there are six short extracts relating to the work of health professionals. For questions <b>1–6</b>, choose the answer (<b>A, B</b> or <b>C</b>) which you think fits best according to the text.", BASE), Spacer(1, 4)]
    s += fill_circle_note("ABC", "B")
    for i, (title, frm, body, q, opts, _) in enumerate(B, 1):
        s += [mc_question(i, q, opts, "ABC"), extract_box(title, frm, body), Spacer(1, 18)]
    s += [PageBreak(), Paragraph("Part C", CENTER_H),
          Paragraph("In this part of the test, there are two texts about different aspects of healthcare. For questions <b>7–22</b>, choose the answer (<b>A, B, C</b> or <b>D</b>) which you think fits best according to the text.", BASE), Spacer(1, 4)]
    s += fill_circle_note("ABCD", "C")
    for title, ps, items, tag in ((T1, t1, C1, 1), (T2, t2, C2, 2)):
        s.append(Paragraph("Text %d: %s" % (tag, title), ParagraphStyle("tt2", parent=BASE, fontName="Helvetica-Bold", fontSize=11, spaceBefore=6, spaceAfter=8)))
        s += [Paragraph(p, BODY) for p in ps]
        s += [PageBreak(), Paragraph("Text %d: Questions %d–%d" % (tag, items[0][0], items[-1][0]), H_Q), Spacer(1, 4)]
        for n, q, opts, _ in items:
            s.append(mc_question(n, q, opts, "ABCD"))
        s.append(PageBreak())
    s.pop()
    s += [Spacer(1, 10), Paragraph("<b>END OF READING TEST<br/>HAND IN THIS BOOKLET TO YOUR TUTOR.</b>", SMALL)]
    return s
name = sys.argv[3] if len(sys.argv) > 3 else "Learning_Test_1_Reading_Parts_B_and_C_Question_and_Answer_Booklet.pdf"
make_doc(OUT + "/" + name, story, title="Reading Parts B and C: Question and Answer Booklet",
         cover_cfg={"title": "READING PARTS B&C: QUESTION AND ANSWER BOOKLET", "box_label": EXAM, "score_max": "22", "mode": "untimed",
                    "time_line": "TIME: NO TIME LIMIT (UNTIMED LEARNING TEST)",
                    "instructions": ["Work through Part B and then Part C in this <b>Question and Answer Booklet</b>.", "One mark is given for each correct answer. Answer <b>ALL</b> questions.",
                                     "Take as long as you need. Use only the texts in this booklet.",
                                     "<b>How to answer:</b> mark your answers in this booklet by filling in the circle using a 2B pencil. Fill the circle in completely, like the example."]})
