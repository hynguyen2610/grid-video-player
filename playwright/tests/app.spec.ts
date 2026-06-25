import path from 'node:path';
import { expect, test } from '../helpers/electron';

const sampleLocalVideoPath = path.resolve(__dirname, '../fixtures/sample-local.mp4');

async function addLocalSource(page: Parameters<typeof test>[0]['page'], label: string) {
  await page.getByTestId('toolbar-add-video').click();
  await expect(page.getByTestId('source-picker-dialog')).toBeVisible();
  await page.getByLabel('Label').fill(label);
  await page.getByLabel('Selected file').fill(sampleLocalVideoPath);
  await page.getByRole('button', { name: 'Validate & Confirm' }).click();
  await expect(page.getByTestId('source-picker-dialog')).toBeHidden();
}

test.beforeEach(async ({ page }) => {
  await page.evaluate(async () => {
    await window.gridVideoTest?.setSelectedLocalVideo(null);
    await window.gridVideoTest?.setImportedPreset(null);
    window.gridVideoTest?.setPromptResponse(null);
  });
});

test('launches to the empty grid state', async ({ page }) => {
  await expect(page.getByText('The grid is empty.')).toBeVisible();
  await expect(page.getByTestId('toolbar-add-video')).toBeVisible();
  await expect(page.getByTestId('grid-add-tile')).toBeVisible();
});

test('adds a local source through the source picker and keeps the add tile visible', async ({ page }) => {
  await addLocalSource(page, 'Garage');
  await expect(page.getByText('Garage')).toBeVisible();
  await expect(page.getByTestId('grid-add-tile')).toBeVisible();
});

test('applies mute all to all active cells', async ({ page }) => {
  await addLocalSource(page, 'Front Door');
  await addLocalSource(page, 'Garage');
  await expect(page.getByText('Front Door')).toBeVisible();
  await expect(page.getByText('Garage')).toBeVisible();

  await page.getByRole('button', { name: 'Mute All' }).click();

  const unmuteButtons = page.getByRole('button', { name: 'Unmute' });
  await expect(unmuteButtons).toHaveCount(2);
});
