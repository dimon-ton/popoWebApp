import { test as baseTest, expect as baseExpect } from '@playwright/test';

// Helper to resolve the actual sandboxed Frame object for evaluate()
async function getInnerFrame(page: any) {
  for (let i = 0; i < 50; i++) {
    const sandboxFrame = page.frames().find((f: any) => f.name() === 'sandboxFrame');
    const userHtmlFrame = sandboxFrame?.childFrames().find((f: any) => f.name() === 'userHtmlFrame');
    if (userHtmlFrame) return userHtmlFrame;
    await page.waitForTimeout(200);
  }
  throw new Error("Timeout waiting for inner frame #userHtmlFrame to load");
}

export function wrapPage(page: any): any {
  const warningCloseBtn = page.locator('button:has-text("ปิด")');

  // Intercept goto to dismiss Google's warning banner
  const originalGoto = page.goto.bind(page);
  page.goto = async (url: string, options?: any) => {
    const response = await originalGoto(url, options);
    try {
      if (await warningCloseBtn.isVisible({ timeout: 3000 })) {
        await warningCloseBtn.click();
      }
    } catch (e) {
      // Warning dialog not present, continue
    }
    return response;
  };

  const frameLocator = page.frameLocator('#sandboxFrame').frameLocator('#userHtmlFrame');

  // Helper to ensure navbar user dropdown is open before interacting with logout button
  const ensureDropdownOpen = async () => {
    const trigger = frameLocator.locator('.navbar-user-trigger');
    const dropdown = frameLocator.locator('.navbar-dropdown');
    try {
      if (await trigger.isVisible({ timeout: 1000 })) {
        const isOpen = await dropdown.evaluate((el: any) => el.classList.contains('open'));
        if (!isOpen) {
          await trigger.click();
          await page.waitForTimeout(250); // wait for dropdown open transition
        }
      }
    } catch (e) {
      // Ignore if navbar elements are missing
    }
  };

  // Proxy the page object
  return new Proxy(page, {
    get(target, prop, receiver) {
      // Synchronous locator creation
      if (prop === 'locator') {
        return (selector: string, options?: any) => {
          let finalSel = selector;
          if (selector === '#logoutBtn') {
            finalSel = 'a:has-text("ออกจากระบบ")';
            // Trigger dropdown open asynchronously in the background so that
            // Playwright's retrying assertions will eventually find the element visible.
            ensureDropdownOpen();
          }
          
          const loc = frameLocator.locator(finalSel, options);

          // If it is the logoutBtn, return a proxied locator that auto-opens the dropdown menu
          if (selector === '#logoutBtn') {
            return new Proxy(loc, {
              get(targetLoc, locatorProp, locatorReceiver) {
                const triggerProps = ['click', 'isVisible', 'waitFor', 'hover'];
                if (triggerProps.includes(locatorProp as string)) {
                  return async (...locatorArgs: any[]) => {
                    await ensureDropdownOpen();
                    return (targetLoc as any)[locatorProp](...locatorArgs);
                  };
                }
                return Reflect.get(targetLoc, locatorProp, locatorReceiver);
              }
            });
          }
          return loc;
        };
      }

      // Direct action shortcuts mapped to Locator actions
      const locatorActionMethods = [
        'click', 'fill', 'check', 'uncheck', 'selectOption', 
        'textContent', 'inputValue', 'innerHTML', 'innerText', 
        'getAttribute', 'isVisible', 'isEnabled', 'isDisabled', 'isChecked'
      ];
      if (locatorActionMethods.includes(prop as string)) {
        return async (selector: string, ...args: any[]) => {
          if (selector === '#logoutBtn') {
            await ensureDropdownOpen();
            const locator = frameLocator.locator('a:has-text("ออกจากระบบ")');
            return (locator as any)[prop](...args);
          } else {
            const locator = frameLocator.locator(selector);
            return (locator as any)[prop](...args);
          }
        };
      }

      // Map page.waitForSelector to locator.waitFor
      if (prop === 'waitForSelector') {
        return async (selector: string, options?: any) => {
          if (selector === '#logoutBtn') {
            await ensureDropdownOpen();
            return frameLocator.locator('a:has-text("ออกจากระบบ")').waitFor({
              state: (options?.state || 'visible') as any,
              timeout: options?.timeout
            });
          }
          const stateMap: Record<string, string> = {
            'visible': 'visible',
            'hidden': 'hidden',
            'attached': 'attached',
            'detached': 'detached'
          };
          const state = options?.state ? stateMap[options.state] : 'visible';
          return frameLocator.locator(selector).waitFor({
            state: state as any,
            timeout: options?.timeout
          });
        };
      }

      // Evaluate must run in the frame's window context
      if (prop === 'evaluate') {
        return async (fn: any, arg?: any) => {
          const frame = await getInnerFrame(page);
          return frame.evaluate(fn, arg);
        };
      }

      return Reflect.get(target, prop, receiver);
    }
  });
}

export const test = baseTest.extend({
  page: async ({ page }, use) => {
    await use(wrapPage(page));
  }
});

export const expect = baseExpect;
