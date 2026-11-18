import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from learn1_data import A_MATCH, A_GAP
from yeo import *
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
import os; os.makedirs(OUT, exist_ok=True)
EXAM = "LEARNING TEST 1 (UNTIMED)"

# ---------- Part A text booklet
def text_story():
    s = bullets(["Look at the four texts, <b>A–D</b>, in this booklet.",
                 "For each question, <b>1–20</b>, look through the texts, <b>A–D</b>, to find the relevant information.",
                 "Write your answers in the separate <b>Question and Answer Booklet</b>.",
                 "<b>Time allowed:</b> no time limit. This is an untimed learning test."])
    s += [rule(space=8)]
    s += [text_box("Text A", "Riverside Hospital: Hand Hygiene Policy (extract)", [
        ("h", "1. Technique"), ("p", "Alcohol-based hand rub is the preferred method for routine hand cleaning when hands are not visibly soiled. Apply enough product to cover all surfaces of the hands and rub for at least 20 seconds, until dry. When hands are visibly dirty, wash with soap and water for at least 40 seconds and dry thoroughly with disposable paper towels."),
        ("h", "2. Soap and water"), ("p", "Alcohol rub does not kill the spores of Clostridioides difficile or the norovirus. Staff caring for patients with either infection must therefore wash their hands with soap and water, even if their hands appear clean."),
        ("h", "3. Appearance"), ("p", "Fingernails must be kept short and free of polish or artificial nails. Staff must not wear wrist watches, bracelets or rings with stones in clinical areas. A plain wedding band is permitted. Any cut or broken skin must be covered with a waterproof dressing before patient contact.")]),
        text_box("Text B", "Ward 9 Hand Hygiene Audit: July to September", [
        ("p", "Trained auditors observed 400 opportunities for hand hygiene on Ward 9 during the quarter. Overall compliance was 68%, compared with 74% in the previous quarter and below the hospital target of 85%."),
        ("h", "Compliance by moment"), ("bl", ["After body fluid exposure: 92%", "After touching a patient: 72%", "Before an aseptic procedure: 74%", "Before touching a patient: 61%", "After touching a patient’s surroundings: 52%"]),
        ("h", "Compliance by staff group"), ("p", "Nurses 78%; doctors 59%; allied health staff 65%."),
        ("h", "Reasons given for missed opportunities"), ("bl", ["Dispenser empty or missing: 31%", "Too busy: 27%", "Gloves worn instead: 19%", "Skin irritation: 11%", "Other: 12%"]),
        ("h", "Recommendations"), ("bl", ["Check that every dispenser is refilled at the start of each shift.", "Give each member of staff a pocket-sized bottle of hand rub to carry.", "Repeat the audit in three months."])]),
        text_box("Text C", "Helping Us Keep You Safe: Information for Patients and Visitors", [
        ("p", "Infections can spread easily in hospitals, and clean hands are the best protection. Please help us by cleaning your hands with the gel provided when you enter the ward and again when you leave."),
        ("p", "Patients should clean their hands before meals and after using the toilet. If you need help to do this, please ask a member of staff."),
        ("p", "Please do not visit if you have had diarrhoea or vomiting in the last 48 hours, or if you have a cold, cough or fever. If a relative is in a single room with a sign on the door, please speak to the nurse in charge before you go in."),
        ("p", "You are always welcome to ask any member of staff, ‘Have you cleaned your hands?’ We will not be offended; we will be glad you asked.")]),
        text_box("Text D", "Ward Newsletter: Looking After Your Hands", [
        ("p", "Hand hygiene protects patients, but frequent cleaning can take its toll on staff. Studies suggest that around 25 per cent of health care workers develop hand dermatitis at some point in their career, and many do not report it. Cracked skin is more than uncomfortable: it can harbour bacteria and make thorough cleaning more difficult."),
        ("p", "To protect your skin, apply a hospital-approved moisturiser at the end of every shift and whenever your hands feel dry. Choose alcohol rub in preference to soap where it is suitable, because it is generally gentler. Avoid using soap and alcohol rub one straight after the other, as this can strip the skin of its natural oils and cause irritation."),
        ("p", "If your skin becomes red, sore or cracked, tell your line manager and contact the Occupational Health department for advice. Early treatment usually prevents the problem from becoming serious.")])]
    return s
make_doc(OUT + "/Learning_Test_1_Reading_Part_A_Text_Booklet.pdf", text_story,
         header_cfg={"title": "READING PART A: TEXT BOOKLET", "subtitle": "TRAINING CENTRE  ·  " + EXAM}, title="Reading Part A: Text Booklet")

# ---------- Part A question and answer booklet
def qa_story():
    s = [Paragraph("Part A", CENTER_H)]
    s += bullets(["Look at the four texts, <b>A–D</b>, in the separate <b>Text Booklet</b>.",
                  "For each question, <b>1–20</b>, look through the texts, <b>A–D</b>, to find the relevant information.",
                  "Write your answers in the spaces provided in this <b>Question and Answer Booklet</b>.",
                  "Your answers should <b>only</b> be taken from texts <b>A–D</b> and must be correctly spelt."])
    s += [rule(), Paragraph("<b>Hand hygiene on the ward:</b> Questions", ParagraphStyle("c", parent=BASE, alignment=1, fontSize=10, spaceAfter=6))]
    s += [Paragraph("Questions 1–6", H_Q),
          Paragraph("For each question, <b>1–6</b>, decide which text (<b>A, B, C</b> or <b>D</b>) the information comes from. Write the letter <b>A, B, C</b> or <b>D</b> in the space provided. You may use any letter more than once.", BASE), Spacer(1, 6),
          Paragraph("In which text can you find information that", BASE), Spacer(1, 6)]
    rows = [[Paragraph("<b>%d</b>" % n, BASE), Paragraph(q, BASE), ""] for n, q, _ in A_MATCH]
    t = Table(rows, colWidths=[22, 400, 70])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "BOTTOM"), ("LINEBELOW", (2, 0), (2, -1), 0.6, colors.black), ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 3), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    s += [t, Paragraph("Questions 7–20", H_Q),
          Paragraph("Complete each of the sentences, <b>7–20</b>, with a word or a number from one of the texts. Each answer may include words, numbers or both.", BASE), Spacer(1, 8)]
    for n, q, hint, _, _ in A_GAP:
        stem = q.replace("___________", "_______________")
        r = Table([[Paragraph("<b>%d</b>" % n, BASE), Paragraph(stem, BASE)]], colWidths=[40, 450])
        r.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 12), ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
        s.append(r)
    s += [Spacer(1, 14), Paragraph("<b>END OF PART A<br/>THIS IS THE END OF THE UNTIMED PART A TEST. HAND IN BOTH BOOKLETS.</b>", SMALL)]
    return s
make_doc(OUT + "/Learning_Test_1_Reading_Part_A_Question_and_Answer_Booklet.pdf", qa_story, title="Reading Part A: Question and Answer Booklet",
         cover_cfg={"title": "READING PART A: QUESTION AND ANSWER BOOKLET", "box_label": EXAM, "score_max": "20", "mode": "untimed",
                    "time_line": "TIME: NO TIME LIMIT (UNTIMED LEARNING TEST)",
                    "instructions": ["Write your answers in the spaces provided in this <b>Question and Answer Booklet</b>.",
                                     "Use the separate <b>Text Booklet</b> to find the information. Take as long as you need.",
                                     "One mark is given for each correct answer. Answer <b>ALL</b> questions.",
                                     "Your answers must be correctly spelt. Write a word, a number, or both – <b>not</b> full sentences."]})
