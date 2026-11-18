# YouEngage OET printable-exam template ("Paper Exam" booklets)

Reference for building paper-based practice exams. `examples/` holds the six booklets that define the house format
(supplied by the tutor, Paper Exam 1). `code/` holds a ReportLab implementation of that format.

## The paper exam package (one set per exam)
| Booklet | Pages | Notes |
|---|---|---|
| Listening: Question and Answer Booklet | 7 | cover + Parts A, B, C answer spaces; /42 |
| Reading Part A: Text Booklet | 3 | four texts A to D, one navy-tab box per text |
| Reading Part A: Question and Answer Booklet | 3 | cover + Part A questions (1-6 letter blanks, 7-20 gap fill); /20 |
| Reading Parts B&C: Question and Answer Booklet | 15 | cover + Part B extracts + Part C texts and questions; bubble answers; /22 |
| Writing Sub-test: Question Booklet | 2 | case notes + task, reading time 5 min, writing 40 min |
| Writing Sub-test: Answer Booklet | 3 | lined answer pages |
Plus a separate answer key (our Exam 6-8 key style: grey-blue header row, Part A table, Parts B and C table).

## Visual spec (A4, Helvetica)
- Header: logo (code/logo.png) top left, "YouEngage OET" bold navy 17 pt, "TRAINING CENTRE . LUSAKA, ZAMBIA" 8 pt; boxed label top right ("PAPER EXAM 1").
- Navy (#00397D) banner with the booklet title in white bold.
- Cover: candidate name line, D.O.B. 8 boxes, Profession (Nursing) box, Venue and Test date boxes, the "Example" 2/5 bubble grid, the 8-column Candidate Number bubble grid, a timed-test notice, Date completed line, Score ___ / N, "TIME: N MINUTES", navy "INSTRUCTIONS TO CANDIDATES" bar and box.
- Inside pages: centred bold "Part A/B/C", bullet instructions, rule, then questions. Part A blanks are drawn lines. Part B and C use answer bubbles with a "Fill the circle in completely. Example" strip.
- Footer: "YouEngage OET Training Centre . Olympia, Lusaka . Original practice material - not an official OET test", page number centred.
- Untimed learning tests: label "LEARNING TEST n (UNTIMED)", notice "UNTIMED LEARNING TEST", "TIME: NO TIME LIMIT".

## Code
- `code/yeo.py`: template library (cover, banners, bubble grids, text boxes, MC with bubbles, extract boxes).
- `code/build_learn1.py`: Part A text booklet + Part A Q&A for Reading Learning Test 1 (worked example; data in `learn1_data.py`).
- `code/build_bc.py text1.txt text2.txt`: Parts B&C booklet; Part C texts come from the two text files (blank-line separated paragraphs).
- Not yet coded: Listening and Writing booklets (copy the layout of the examples).
Run from `code/`: `python3 build_learn1.py` writes to `code/out/`. Requires `reportlab`.
