import { Suite } from 'mocha';
import { openDapp, WINDOW_TITLES } from '../../helpers';
import { withSolanaAccountSnap } from './common-solana';

describe('Solana Account - Dapp Connection', function (this: Suite) {
  it('cannot connect to dapps', async function () {
    await withSolanaAccountSnap(
      { title: this.test?.fullTitle() },
      async (driver) => {
        await openDapp(driver);
        await driver.clickElement('#connectButton');
        await driver.waitUntilXWindowHandles(3);
        await driver.switchToWindowWithTitle(WINDOW_TITLES.Dialog);

        await driver.assertElementNotPresent(
          '[data-testid="choose-account-list-1"]',
        );
      },
    );
  });
});
