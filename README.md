# Ceiling fan study: V-Guard (RMD Group 1, IIM Bangalore)

One link that runs both studies from the report *Known, but not chosen*:

- **Study 1 (survey, H1 to H3):** V-Guard vs Atomberg ratings, purchase channel, awareness and research style.
- **Study 2 (2 × 2 experiment, H4):** one of four versions of a simulated marketplace page for a V-Guard 1200 mm BLDC fan.

Everyone answers the same profile questions. The form then sends each person to **either** the survey **or** one experiment version, never both, so the two samples stay separate as the report requires. Answers go to a Google Sheet that you own.

```
index.html             the form
app.js                 questions, routing, product page, saving
styles.css             look and feel
config.js              the one setting you must edit (Apps Script URL)
apps-script/Code.gs    collects answers into Google Sheets and does the assignment
.nojekyll              tells GitHub Pages to serve the files as they are
```

## How respondents are routed

1. Consent, then profile: age, gender, region, works in a related industry, has bought a fan.
2. Screen-outs: age outside 22 to 40, or works in market research, advertising or the appliance industry.
3. The Apps Script picks the arm:
   - About 40% go to the experiment and 60% to the survey while both are open.
   - Experiment people get the **least-filled version** (ties broken at random), so A to D stay balanced.
   - Survey quotas: once a region × age cell (South India / Rest of India × Gen Z 22–29 / Millennial 30–40) is full, people in that cell go to the experiment. When both are full, they see a polite "we have enough answers" page.
4. **Survey:** channel → heard of V-Guard / Atomberg → how they came to know V-Guard → ratings for each brand they know (V-Guard/Atomberg order randomised) → research style.
5. **Experiment:** heard of V-Guard? (No = screened out, as in the report) → product page with the 4 questions (the Next button unlocks after 8 seconds) → debrief.

The arm is picked **before** awareness is asked, so the survey keeps the natural share of people who don't know V-Guard. The H3 awareness figures depend on that.

## Setup (about 15 minutes)

### 1. Google Sheet and Apps Script
1. Create a new Google Sheet, for example "V-Guard study responses".
2. **Extensions → Apps Script**. Delete what's there and paste in all of `apps-script/Code.gs`. Save.
3. In the function menu at the top choose **setup** and press **Run**. Approve the permissions; Google will warn that the app is unverified, so choose *Advanced → Go to project*. This creates three tabs: `Survey_Responses`, `Experiment_Responses` and `Screened_Out`.
4. **Deploy → New deployment →** gear icon **→ Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Press **Deploy** and copy the **Web app URL** (it ends in `/exec`).

### 2. Connect the form
Open `config.js` and paste the URL:
```js
APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfy.../exec",
```

### 3. Put it on GitHub Pages
1. Create a repository on GitHub, for example `vguard-fan-study`. It must be **public** for free GitHub Pages.
2. Upload every file in this folder, keeping `apps-script/` as a folder. On github.com use **Add file → Upload files** and drag the folder contents in.
3. **Settings → Pages →** Source: *Deploy from a branch*, Branch: `main`, folder `/ (root)` → **Save**.
4. After a minute the form is live at `https://<your-username>.github.io/vguard-fan-study/`.

Or from a terminal:

```bash
git init && git add . && git commit -m "V-Guard fan study form"
```

```bash
git branch -M main && git remote add origin https://github.com/<your-username>/vguard-fan-study.git && git push -u origin main
```

## Test before you share it
Add `?test=` to the link to run one path. Test runs skip the 8-second wait, are saved with `is_test = TRUE` and do not count towards quotas or version balance.

| Link ending | Path |
|---|---|
| `?test=survey` | Study 1 survey |
| `?test=A` | Experiment, neither line (control) |
| `?test=B` | Experiment, trust line only |
| `?test=C` | Experiment, new-launch line only |
| `?test=D` | Experiment, both lines |

**Before real fieldwork, delete the test rows** from the sheet. The R/E numbering is based on row count, so they would otherwise shift the IDs.

## Settings you may want to change
In `apps-script/Code.gs` (after editing, use **Deploy → Manage deployments → Edit → Version: New version** so the change goes live):

| Setting | Default | Meaning |
|---|---|---|
| `QUOTA_PER_CELL` | 75 | Survey completes per region × age cell (4 × 75 = 300 collected, 250 valid target) |
| `VERSION_CAP` | 48 | Experiment completes per version (4 × 48 ≈ 190 collected, 160 valid target) |
| `P_EXPERIMENT` | 0.4 | Share sent to the experiment while both arms are open |

In `config.js`: `MIN_VIEW_SECONDS` (8) is the time the product page must stay on screen.

## The data
The first columns of `Survey_Responses` and `Experiment_Responses` are the same as the sheets used in the report, so the existing analysis code reads them unchanged after **File → Download → .csv**. Extra columns come after them:

- **Both sheets:** `works_in_industry`, `started_at`, `completed_at`, `is_test` and `rid` (a random response id).
- **Survey:** also `brand_order`.
- **Experiment:** also `age`, `gender`, `region`, `first_time_buyer`, `heard_vguard` and `seconds_on_page`.

Filter out `is_test = TRUE` before analysis.

`Screened_Out` logs everyone who didn't qualify, with the reason: `age`, `industry`, `experiment_unaware_vguard` or `quota_full`. You can use it to report incidence rates.

If someone loses their connection at the end, their answers stay in their browser and are sent the next time they open the link. Duplicates are ignored.

## Privacy
No names, emails or phone numbers are collected. The sheet is private to the Google account that owns it. The Apps Script URL only accepts new answers and returns no one's responses.
