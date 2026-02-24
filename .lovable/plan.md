

# V4 Bug Fix Plan: Filtering Failure + NetEase Robustness

## Problem Diagnosis

### Bug 1: Playlist always returns ~990 songs (CRITICAL)
The `finishDislike()` function in `DemoLoopStage.tsx` (line 207-213) only closes the popup UI -- it **never writes** the user's dislike choice into the `preference` state object. As a result, `preference.dislikedGenres`, `dislikedRhythms`, and `dislikedStyles` are always empty arrays, and `generatePlaylist` has zero filter criteria to apply.

Additionally, quiz answers are saved to `preference.quizAnswers` but `generatePlaylist` completely ignores them -- it only checks the (always-empty) disliked arrays.

### Bug 2: NetEase covers sometimes missing
The API itself works (confirmed by live test -- "晴天" returned a valid cover and audio URL). The failures in earlier sessions were likely due to:
- Intermittent NetEase API rate limiting or IP-based blocks
- The matching algorithm being too strict for certain song name formats (parenthetical suffixes, version tags, etc.)

## Fix Plan

### 1. Fix `finishDislike()` to actually update `preference` (DemoLoopStage.tsx)

Before closing the popup, write the selected dislike category and detail into the appropriate preference array:

- If `dislikeCategory === 'type'` and `dislikeDetail` is set: push the detail label (e.g. "太说唱") into `preference.dislikedGenres`
- If `dislikeCategory === 'rhythm'`: push detail label into `preference.dislikedRhythms`
- If `dislikeCategory === 'style'`: push detail label into `preference.dislikedStyles`
- Also handle the follow-up answer: if the user confirms they dislike the entire category, add a broader genre tag

### 2. Make `generatePlaylist` use quiz answers for scoring (vibeEngine.ts)

Currently `generatePlaylist` only checks `dislikedGenres/Rhythms/Styles` by string matching against song name+artist -- which is ineffective for metadata-free songs. The fix:

- Parse quiz answers into scoring signals (e.g., if user selected "not accepting rap" in preference questions, penalize songs with rap-related artist names)
- Use the empirical quiz selections: songs the user picked as "liked" in empirical questions should get a score boost; unpicked songs in those same questions get a mild penalty
- This gives the scoring system real data to work with even when genre tags are absent

### 3. Improve NetEase fuzzy matching (netease-song-info/index.ts)

- Before searching, strip common suffixes like "(Live)", "(Remix)", "(demo)", "(Acoustic)", version tags, and content in parentheses/brackets from song names
- If the first search attempt with the full keyword fails, retry with just the song name (without artist)
- Relax the Levenshtein threshold from 0.6 to 0.5 for shorter song names (under 4 characters)

### 4. Fix `useNeteaseInfo` hook stability (useNeteaseInfo.tsx)

- Remove `cache` from the `fetchBatch` `useCallback` dependency array to prevent the function reference from changing on every cache update
- Use a ref for cache reads inside `fetchBatch` to avoid stale closure issues while keeping a stable function reference

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/DemoLoopStage.tsx` | Fix `finishDislike()` and `handleFollowUpAnswer()` to write dislike data into `preference` |
| `src/lib/vibeEngine.ts` | Update `generatePlaylist` to incorporate quiz answer signals into scoring |
| `supabase/functions/netease-song-info/index.ts` | Strip suffixes before search, add retry logic, relax threshold for short names |
| `src/hooks/useNeteaseInfo.tsx` | Stabilize `fetchBatch` callback reference |

## Technical Details

### finishDislike fix (pseudocode):
```text
finishDislike():
  if dislikeCategory === 'type':
    preference.dislikedGenres.push(dislikeDetail or category label)
  if dislikeCategory === 'rhythm':
    preference.dislikedRhythms.push(dislikeDetail or category label)
  if dislikeCategory === 'style':
    preference.dislikedStyles.push(dislikeDetail or category label)
  close popup, advance demo
```

### generatePlaylist scoring enhancement (pseudocode):
```text
For each remaining song:
  score = 0
  // Existing: penalize disliked genres/rhythms/styles
  // NEW: boost songs chosen in empirical quiz
  if song was selected in empirical quiz answers: score += 5
  // NEW: penalize songs from empirical quiz NOT selected
  if song appeared in quiz but wasn't selected: score -= 3
  // NEW: apply preference quiz signals
  if user said "no rap" and artist contains rap indicators: score -= 8
```

### NetEase search improvement:
```text
1. Strip "(Live)", "(Remix)", "(demo)", etc. from song name
2. Search with cleaned "songName artist"
3. If no match found, retry with just "songName"
4. For names <= 3 chars, lower Levenshtein threshold to 0.5
```

