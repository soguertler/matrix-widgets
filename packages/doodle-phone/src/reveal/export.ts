import { CANVAS_HEIGHT, CANVAS_WIDTH, rasterize } from '../drawing/fill';
import { submissionKey, type Game } from '../model/game';
import { displayName } from '@matrix-widgets/widget-shared';

export async function exportStory(game: Game, bookIndex: number): Promise<void> {
  const book = game.players[bookIndex];
  const rowHeight = CANVAS_HEIGHT + 75;
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = 80 + game.steps * rowHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas unavailable');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#111827';
  context.font = 'bold 28px sans-serif';
  context.fillText(`${displayName(book)}'s Doodle Phone story`, 24, 48);

  for (let round = 0; round < game.steps; round++) {
    const submission = game.submissions.get(submissionKey(round, book));
    if (!submission) continue;
    const top = 80 + round * rowHeight;
    context.fillStyle = '#e2e8f0';
    context.fillRect(0, top, CANVAS_WIDTH, rowHeight);
    context.fillStyle = '#334155';
    context.font = 'bold 20px sans-serif';
    context.fillText(`${round + 1}. ${displayName(submission.author)}`, 24, top + 38);
    if (submission.entry.kind === 'drawing') {
      if (submission.entry.strokes.length) {
        const image = await rasterize(submission.entry.strokes);
        context.drawImage(image, 0, top + 60);
      } else {
        context.fillStyle = '#475569';
        context.fillText(
          submission.entry.emptyReason === 'left' ? '(player left)' : '(time ran out)',
          24,
          top + 105,
        );
      }
    } else {
      context.fillStyle = '#111827';
      context.font = '26px sans-serif';
      const words = submission.entry.text.split(/\s+/);
      let line = '';
      let y = top + 105;
      for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (line && context.measureText(next).width > CANVAS_WIDTH - 48) {
          context.fillText(line, 24, y);
          y += 36;
          line = word;
        } else line = next;
      }
      if (line) context.fillText(line, 24, y);
    }
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not create PNG');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `doodle-phone-story-${bookIndex + 1}.png`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
