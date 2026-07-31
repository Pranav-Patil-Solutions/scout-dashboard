import { chromium } from 'playwright';
import { resolve } from 'path';

const scratchpad = '/private/tmp/claude-501/-Users-pranavpatil/3cfd5cad-590a-4b58-87a4-1756f179dc83/scratchpad';

const files = [
  'Pranav-Resume-ScaleEnergy-2026-07-17.html',
  'Pranav-CoverLetter-ScaleEnergy-2026-07-17.html'
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  for (const file of files) {
    const filePath = resolve(scratchpad, file);
    const outputPath = filePath.replace('.html', '.pdf');

    console.log(`Converting ${file}...`);
    await page.goto(`file://${filePath}`, { waitUntil: 'networkidle' });
    await page.pdf({
      path: outputPath,
      format: 'A4',
      margin: { top: '10mm', right: '12mm', bottom: '10mm', left: '12mm' }
    });
    console.log(`✓ ${outputPath.split('/').pop()}`);
  }

  await browser.close();
  console.log('\n✓ PDFs ready in scratchpad/');
})().catch(console.error);
