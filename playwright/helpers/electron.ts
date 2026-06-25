import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import electronPath from 'electron';
import { _electron as electron, expect, test as base, type ElectronApplication, type Page } from '@playwright/test';
import type { GridSession } from '../../src/shared/types';

interface AppFixtures {
  electronApp: ElectronApplication;
  page: Page;
  seedSession: (session: GridSession) => Promise<void>;
  resetSession: () => Promise<void>;
}

async function launchElectronApp() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grid-video-playwright-'));
  const launchEnv = { ...process.env };
  delete launchEnv.ELECTRON_RUN_AS_NODE;

  const electronApp = await electron.launch({
    executablePath: electronPath as unknown as string,
    args: ['.'],
    cwd: path.resolve(__dirname, '../..'),
    env: {
      ...launchEnv,
      GRID_VIDEO_TEST_MODE: '1',
      GRID_VIDEO_USER_DATA_DIR: userDataDir
    }
  });

  const page = await electronApp.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByText('Multi-source playback wall')).toBeVisible();

  return { electronApp, page, userDataDir };
}

export const test = base.extend<AppFixtures>({
  electronApp: async ({}, use) => {
    const { electronApp } = await launchElectronApp();
    await use(electronApp);
    await electronApp.close();
  },
  page: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await use(page);
  },
  seedSession: async ({ page }, use) => {
    await use(async (session) => {
      await page.evaluate(async (state) => {
        await window.gridVideoTest?.seedSession(state);
      }, session);
      await page.reload();
      await page.waitForLoadState('domcontentloaded');
    });
  },
  resetSession: async ({ page }, use) => {
    await use(async () => {
      await page.evaluate(async () => {
        await window.gridVideoTest?.resetSession();
      });
      await page.reload();
      await page.waitForLoadState('domcontentloaded');
    });
  }
});

export { expect } from '@playwright/test';
