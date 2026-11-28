# Subtitle Editor Guide

After a translation finishes, you can open the built-in subtitle editor to read the result line by line, fix anything that sounds off, and adjust where each line appears on screen. It works offline once the page has loaded: editing happens in your browser, and nothing you type in the editor is sent anywhere.

This guide covers every part of the editor, including keyboard shortcuts and the things it can't do.

## Opening the Editor

Choose **Preview & edit** on a finished file. The editor opens in a window on top of the page. Use **Maximize** if you want more room; the window remembers its size for the rest of your visit. **Close** shuts it, and if you have changes that haven't been applied, you'll be asked to confirm first.

Your edits only reach the download once you choose **Apply changes**. The button stays disabled until something has changed. After applying, the **Original** and **Translation** tabs refresh, and the "Edited" note beside the button shows when you last applied.

## Tabs at a Glance

The tabs along the top of the window are **Editor**, **Glossary**, **Context**, **Original**, **Translation** and **Compare**. Editor is where most of the work happens. The others are covered in their own sections below.

## Reading the Editor Tab

Every subtitle line is a card. The top of each card shows the line number and its timing, for example `#12 · 00:01:02,345 → 00:01:04,100`. Below that are the original text, which is read-only, and the translation, which you can edit. A line without a translation shows the placeholder **Missing translation**.

Cards are grouped into scenes, with dividers labeled **Scene 1**, **Scene 2** and so on. These are the same scene groups the translator used to keep context together, so they're a good guide to where one conversation ends and the next begins.

To edit, click the translation text and type. Pasting always inserts plain text. Press Enter for a line break, and press Esc or Ctrl+Enter to finish. If you reach a card with the Tab key, press Enter to start editing it.

## Highlights and Markers

A colored strip runs along the start edge of each card, and a few other cues tell you what's going on:

- **Accent color strip:** you've edited this line since the translation was produced.
- **Red strip and tint:** the line has a missing translation, or the original text may remain in it.
- **Orange strip and tint:** the line is too long, or its reading speed is too fast. In some bilingual layouts, long-line warnings use a paler tint.
- **Pale tint with the matched text marked:** the line matches your search. The current match gets a stronger tint and an accent strip.
- **Dashed outline:** the line is selected for a batch change.
- **Thin marker bar beside the list:** a map of the whole file. Markers show search matches and the issue types you've switched on, and clicking one jumps to that line.

Red and orange only appear for the issue types you've switched on, as described next.

## Issue Checks

When the editor finds problems, a row of buttons appears above the list, each with a count: **Missing translation**, **Original text may remain**, **Line too long** and **Reading speed (CPS)**. CPS means characters per second, so a higher number leaves viewers less time to read. Thresholds depend on the target language.

Click a button to highlight those lines and show their numbers as small chips you can click to jump to each one. Click it again to switch it off. Edits are rechecked as you type, so a line stops being flagged the moment you fix it. If **Show matches only** is on and the search box is empty, switching on an issue type narrows the list to just those lines.

## Search

The search box looks through both the original and the translation, ignoring capitalization. Next to the box, a chevron opens **More search tools**: the match count (such as 3/12), **Show matches only**, **Previous match** and **Next match**, **Undo** and **Redo**, and **Find & replace**.

You can search three ways:

- **Text:** type any word or phrase. Matches are marked inside the cards.
- **Time:** type a timestamp such as `01:02:03`, `1:02` or `90s`, or a range such as `00:10-00:20`. You'll land on the line showing at that moment, or the nearest one.
- **Line number:** type `#42` to find line 42.

With **Show matches only** off, every line stays in place, matches are highlighted, and the list scrolls to the first match. Turn it on and the list shrinks to the matching lines alone. This is the easiest way to deal with a pattern, for example every line containing a musical note. The choice is remembered until you reload the page.

Use **Next match** and **Previous match**, or the shortcuts below, to step through the results.

## Find and Replace

Choose **Find & replace** or press Ctrl+H to show a second row with a **Replace with** field. **Replace** changes the current match, and **Replace all** changes every match.

Replacement only touches translations, never the original text, and it needs the exact text you typed, including capitalization. After each run, a short message tells you how many lines changed and how many were skipped because the match sits in the original. A whole replacement counts as one step for undo.

## Undo and Redo

**Undo** and **Redo** step through your edits, replacements and position changes. Everything you type into one card during a single editing session counts as one step. The history lasts until you close the editor, and it doesn't cover changes in the Context and Glossary tabs.

## Keyboard Shortcuts

On macOS, use Cmd in place of Ctrl. The shortcuts work on the Editor tab while the editor is the topmost window.

| Shortcut | What it does |
| --- | --- |
| Ctrl+F | Focus the search box |
| Ctrl+H | Open Find & replace |
| Enter or ↓ in the search box | Go to the next match |
| Shift+Enter or ↑ in the search box | Go to the previous match |
| Ctrl+Z | Undo |
| Ctrl+Y or Ctrl+Shift+Z | Redo |
| Enter on a focused card | Start editing |
| Enter while editing | Insert a line break |
| Esc or Ctrl+Enter while editing | Finish editing |
| Shift+click on a card | Select a range of lines |
| Esc | Close the replace row, or close the window if it's already closed |

While the cursor is in the search or replace field, Ctrl+Z and Ctrl+Y act on the text in that field rather than on your subtitle edits.

## Selecting Several Lines

Click an empty part of a card, away from its text, to select it. Click it again to deselect. Hold Shift and click another card to select every line between the two. Locked lines are skipped.

Selection follows what the list is showing. If you search with **Show matches only** on, you can select the first and last match and get every matching line in one go.

Batch selection is used to change the position of many lines at once. See the next section.

## Changing Subtitle Position

Every card has a small position icon on the end side of its header. It's highlighted when the line differs from the default position. Click it and a window titled **Subtitle position** opens with a grid of nine placements, from top left to bottom right. Pick one and the line moves.

To move many lines together, select them first as described above, then click the position icon on any selected line. The window is then titled with the number of lines, and your choice applies to all of them. Songs and on-screen text are the usual reasons to do this.

Positions are written into the file as ASS alignment, WebVTT cue settings or SRT tags. How faithfully a player honors them varies, SRT in particular.

## The "Support This Project" Credit

If **Support this project** is on, a short credit is added after the last subtitle line, shown for a few seconds. In the editor, it appears as the final card, labeled **Original kept**. It can't be edited or moved, and it isn't part of the translation. It's generated from a setting rather than from your subtitles.

To remove it, close the editor, open **Output** in the translator, expand **More options**, and switch **Support this project** off. The next time you open the editor, the card is gone. It's on by default because it's how people discover the tool. [How to Contribute](../contribute/en.md#support-this-project) explains the idea and why we hope you'll keep it on when sharing subtitles.

## Context and Glossary

These two tabs hold the same settings you can set before translating. **Glossary** is a list of terms with the translation you want for each. **Context** is a short background note, with a character counter, that helps the engine understand the story. **Import from history** copies the note from an earlier job. Some engines don't support context, and in that case the tab is locked.

Choose **Apply changes** to save them. They take effect the next time this file is translated, and they don't alter the lines you see now.

## Original, Translation and Compare

**Original** shows the source subtitle file as text, and **Translation** shows the translated file exactly as it will be downloaded. Both have a **Download** button. The Translation tab only changes after you choose **Apply changes**.

**Compare** puts the two files side by side, aligned line by line, with the language names at the bottom. Horizontal scrolling is linked between the two sides. It's read-only, so it's best for a final check of the real file.

## Limitations

- The original text can't be edited. Only translations are editable.
- The credit line is locked, as described above.
- With **Split** layout, the position grid only offers placements for the translation, which are its own row and the middle row. The area taken by the other language is fixed, so you can't change the other language's position. Split also only applies to bilingual output, and SRT falls back to stacked.
- Undo history is lost when you close the editor, and Context and Glossary changes aren't in it.
- Searching by time or line number selects lines, but it doesn't highlight text.

## Right-to-Left Languages

In right-to-left interface languages, the whole editor mirrors. The tabs, the search tools, the strip on each card and the position icon all swap sides, and the undo and redo icons flip direction. That's why this guide talks about the start and end of things instead of left and right. Subtitle text in each card follows its own language's direction.

## Reporting Problems

If something in the editor doesn't behave as described here, please let us know. The **Report an issue** link at the bottom of the window brings you to this page. Then follow [Feedback & Suggestions](../feedback/en.md) to send your report.

It helps to include the line number (such as `#12`), what you did just before, and the version number shown at the bottom of the page. For the access and keyboard side of the editor, see [Accessibility Statement](../accessibility/en.md).
