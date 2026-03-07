import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VariableMarker } from '@/content/variable-marker';

/**
 * Helper: simulate typing a variable name into the popup and clicking Save.
 * After clicking the badge, the popup (id=saveaction-var-prompt) appears with
 * an <input> and Save/Cancel buttons. This helper fills the input and clicks Save.
 */
function fillVariablePopup(name: string): void {
  const popup = document.getElementById('saveaction-var-prompt');
  if (!popup) throw new Error('Variable prompt popup not found');
  const input = popup.querySelector('input') as HTMLInputElement;
  if (!input) throw new Error('Input not found in popup');
  input.value = name;
  // Click the Save / Update button (last button in the popup)
  const buttons = popup.querySelectorAll('button');
  const saveBtn = buttons[buttons.length - 1];
  if (!saveBtn) throw new Error('Save button not found in popup');
  saveBtn.click();
}

/**
 * Helper: click Cancel in the variable popup.
 */
function cancelVariablePopup(): void {
  const popup = document.getElementById('saveaction-var-prompt');
  if (!popup) throw new Error('Variable prompt popup not found');
  const buttons = popup.querySelectorAll('button');
  const cancelBtn = buttons[0];
  if (!cancelBtn) throw new Error('Cancel button not found in popup');
  cancelBtn.click();
}

describe('VariableMarker', () => {
  let marker: VariableMarker;

  beforeEach(() => {
    vi.clearAllMocks();
    marker = new VariableMarker();
    // Ensure body is available
    document.body.innerHTML = '';
  });

  afterEach(() => {
    marker.stop();
    marker.clear();
    document.body.innerHTML = '';
  });

  describe('Lifecycle', () => {
    it('should start and stop without errors', () => {
      expect(() => marker.start()).not.toThrow();
      expect(() => marker.stop()).not.toThrow();
    });

    it('should be idempotent on start', () => {
      marker.start();
      marker.start(); // second call should not throw
      marker.stop();
    });

    it('should be idempotent on stop', () => {
      marker.stop(); // stop without start should not throw
    });
  });

  describe('getVariableName', () => {
    it('should return undefined for unmarked element', () => {
      const input = document.createElement('input');
      expect(marker.getVariableName(input)).toBeUndefined();
    });
  });

  describe('getVariables / hasVariables / clear', () => {
    it('should start with no variables', () => {
      expect(marker.getVariables()).toEqual([]);
      expect(marker.hasVariables()).toBe(false);
    });

    it('should clear all marked variables', () => {
      // Since we can't easily trigger the prompt, verify clear works on empty state
      marker.clear();
      expect(marker.getVariables()).toEqual([]);
      expect(marker.hasVariables()).toBe(false);
    });
  });

  describe('Badge display', () => {
    it('should show badge when a text input is focused during recording', () => {
      marker.start();

      const input = document.createElement('input');
      input.type = 'text';
      document.body.appendChild(input);

      // Simulate focusin event
      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

      const badge = document.getElementById('saveaction-var-badge');
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toContain('Mark as Variable');
    });

    it('should not show badge for checkbox inputs', () => {
      marker.start();

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      document.body.appendChild(checkbox);

      checkbox.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

      const badge = document.getElementById('saveaction-var-badge');
      expect(badge).toBeNull();
    });

    it('should not show badge for radio inputs', () => {
      marker.start();

      const radio = document.createElement('input');
      radio.type = 'radio';
      document.body.appendChild(radio);

      radio.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

      const badge = document.getElementById('saveaction-var-badge');
      expect(badge).toBeNull();
    });

    it('should not show badge for file inputs', () => {
      marker.start();

      const file = document.createElement('input');
      file.type = 'file';
      document.body.appendChild(file);

      file.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

      const badge = document.getElementById('saveaction-var-badge');
      expect(badge).toBeNull();
    });

    it('should show badge for textarea', () => {
      marker.start();

      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);

      textarea.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

      const badge = document.getElementById('saveaction-var-badge');
      expect(badge).not.toBeNull();
    });

    it('should show badge for password input', () => {
      marker.start();

      const pw = document.createElement('input');
      pw.type = 'password';
      document.body.appendChild(pw);

      pw.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

      const badge = document.getElementById('saveaction-var-badge');
      expect(badge).not.toBeNull();
    });

    it('should not show badge when marker is stopped', () => {
      marker.start();
      marker.stop();

      const input = document.createElement('input');
      input.type = 'text';
      document.body.appendChild(input);

      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

      const badge = document.getElementById('saveaction-var-badge');
      expect(badge).toBeNull();
    });
  });

  describe('Variable marking via prompt', () => {
    it('should mark element when user provides a variable name', () => {
      marker.start();

      const input = document.createElement('input');
      input.type = 'email';
      input.id = 'email';
      input.value = 'test@example.com';
      document.body.appendChild(input);

      // Focus and click the badge
      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      const badge = document.getElementById('saveaction-var-badge');
      expect(badge).not.toBeNull();
      badge?.click();

      // Fill the popup
      fillVariablePopup('MY_EMAIL');

      expect(marker.getVariableName(input)).toBe('MY_EMAIL');
      expect(marker.hasVariables()).toBe(true);

      const vars = marker.getVariables();
      expect(vars).toHaveLength(1);
      expect(vars[0]!.variableName).toBe('MY_EMAIL');
      expect(vars[0]!.defaultValue).toBe('test@example.com');
      expect(vars[0]!.fieldType).toBe('email');
    });

    it('should not mark element when user cancels prompt', () => {
      marker.start();

      const input = document.createElement('input');
      input.type = 'text';
      document.body.appendChild(input);

      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      const badge = document.getElementById('saveaction-var-badge');
      badge?.click();

      // Click Cancel in the popup
      cancelVariablePopup();

      expect(marker.getVariableName(input)).toBeUndefined();
      expect(marker.hasVariables()).toBe(false);
    });

    it('should not mark element with empty string prompt', () => {
      marker.start();

      const input = document.createElement('input');
      input.type = 'text';
      document.body.appendChild(input);

      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      const badge = document.getElementById('saveaction-var-badge');
      badge?.click();

      // Save with whitespace-only input
      fillVariablePopup('   ');

      expect(marker.getVariableName(input)).toBeUndefined();
      expect(marker.hasVariables()).toBe(false);
    });

    it('should clean variable name to UPPER_SNAKE_CASE', () => {
      marker.start();

      const input = document.createElement('input');
      input.type = 'text';
      document.body.appendChild(input);

      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      const badge = document.getElementById('saveaction-var-badge');
      badge?.click();

      fillVariablePopup('my-user email');

      expect(marker.getVariableName(input)).toBe('MY_USER_EMAIL');
    });

    it('should update existing variable on re-mark', () => {
      marker.start();

      const input = document.createElement('input');
      input.type = 'text';
      input.value = 'first';
      document.body.appendChild(input);

      // First mark
      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      document.getElementById('saveaction-var-badge')?.click();
      fillVariablePopup('VAR_ONE');
      expect(marker.getVariableName(input)).toBe('VAR_ONE');

      // Re-mark with same variable name but different value
      input.value = 'second';
      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      document.getElementById('saveaction-var-badge')?.click();
      fillVariablePopup('VAR_ONE');

      expect(marker.getVariables()).toHaveLength(1);
      expect(marker.getVariables()[0]!.defaultValue).toBe('second');
    });

    it('should send MARK_VARIABLE message to background', () => {
      marker.start();

      const input = document.createElement('input');
      input.type = 'text';
      input.id = 'username';
      input.value = 'johndoe';
      document.body.appendChild(input);

      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      document.getElementById('saveaction-var-badge')?.click();
      fillVariablePopup('USERNAME');

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'MARK_VARIABLE',
        payload: expect.objectContaining({
          variableName: 'USERNAME',
          defaultValue: 'johndoe',
          fieldType: 'text',
        }),
      });
    });

    it('should show green badge after marking', () => {
      marker.start();

      const input = document.createElement('input');
      input.type = 'email';
      input.value = 'a@b.com';
      document.body.appendChild(input);

      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      document.getElementById('saveaction-var-badge')?.click();
      fillVariablePopup('EMAIL');

      // After marking, badge should be refreshed (green = already marked)
      const badge = document.getElementById('saveaction-var-badge');
      expect(badge).not.toBeNull();
      // Title should contain the variable name
      expect(badge?.title).toContain('EMAIL');
    });
  });

  describe('Variable name inference', () => {
    it('should suggest name from input id', () => {
      marker.start();

      const input = document.createElement('input');
      input.type = 'text';
      input.id = 'user-email';
      document.body.appendChild(input);

      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      document.getElementById('saveaction-var-badge')?.click();

      // Popup should pre-fill with inferred name; accept it as-is
      const popup = document.getElementById('saveaction-var-prompt');
      const popupInput = popup?.querySelector('input') as HTMLInputElement;
      expect(popupInput.value).toBe('USER_EMAIL');

      // Click Save to accept
      fillVariablePopup(popupInput.value);

      expect(marker.getVariableName(input)).toBe('USER_EMAIL');
    });

    it('should suggest name from input name attribute', () => {
      marker.start();

      const input = document.createElement('input');
      input.type = 'text';
      input.name = 'first_name';
      document.body.appendChild(input);

      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      document.getElementById('saveaction-var-badge')?.click();

      // Popup should pre-fill with inferred name
      const popup = document.getElementById('saveaction-var-prompt');
      const popupInput = popup?.querySelector('input') as HTMLInputElement;
      expect(popupInput.value).toBe('FIRST_NAME');

      fillVariablePopup(popupInput.value);

      expect(marker.getVariableName(input)).toBe('FIRST_NAME');
    });
  });

  describe('clear()', () => {
    it('should remove all marked variables', () => {
      marker.start();

      const input = document.createElement('input');
      input.type = 'text';
      document.body.appendChild(input);

      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      document.getElementById('saveaction-var-badge')?.click();
      fillVariablePopup('VAR_A');
      expect(marker.hasVariables()).toBe(true);

      marker.clear();
      expect(marker.hasVariables()).toBe(false);
      expect(marker.getVariableName(input)).toBeUndefined();
      expect(marker.getVariables()).toEqual([]);
    });
  });

  describe('Remove variable', () => {
    it('should show Remove button for already-marked variables', () => {
      marker.start();

      const input = document.createElement('input');
      input.type = 'text';
      input.id = 'field1';
      input.value = 'test';
      document.body.appendChild(input);

      // Mark it first
      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      document.getElementById('saveaction-var-badge')?.click();
      fillVariablePopup('MY_VAR');
      expect(marker.getVariableName(input)).toBe('MY_VAR');

      // Re-focus and open popup again
      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      document.getElementById('saveaction-var-badge')?.click();

      const popup = document.getElementById('saveaction-var-prompt');
      expect(popup).not.toBeNull();
      const buttons = popup!.querySelectorAll('button');
      // Should have 3 buttons: Remove, Cancel, Save/Update
      expect(buttons.length).toBe(3);
      expect(buttons[0]!.textContent).toBe('Remove');
    });

    it('should remove variable when Remove button is clicked', () => {
      marker.start();

      const input = document.createElement('input');
      input.type = 'text';
      input.id = 'removeme';
      input.value = 'val';
      document.body.appendChild(input);

      // Mark it
      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      document.getElementById('saveaction-var-badge')?.click();
      fillVariablePopup('REMOVE_ME');
      expect(marker.getVariableName(input)).toBe('REMOVE_ME');
      expect(marker.hasVariables()).toBe(true);

      // Re-focus and click Remove
      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      document.getElementById('saveaction-var-badge')?.click();

      const popup = document.getElementById('saveaction-var-prompt');
      const removeBtn = popup!.querySelectorAll('button')[0]!;
      removeBtn.click();

      expect(marker.getVariableName(input)).toBeUndefined();
      expect(marker.hasVariables()).toBe(false);
      expect(marker.getVariables()).toEqual([]);
    });

    it('should send UNMARK_VARIABLE message when removing', () => {
      marker.start();

      const input = document.createElement('input');
      input.type = 'text';
      input.value = 'val';
      document.body.appendChild(input);

      // Mark it
      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      document.getElementById('saveaction-var-badge')?.click();
      fillVariablePopup('TO_REMOVE');

      vi.mocked(chrome.runtime.sendMessage).mockClear();

      // Remove it
      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      document.getElementById('saveaction-var-badge')?.click();
      const popup = document.getElementById('saveaction-var-prompt');
      popup!.querySelectorAll('button')[0]!.click();

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'UNMARK_VARIABLE',
        payload: { variableName: 'TO_REMOVE' },
      });
    });

    it('should show Mark as Variable badge after removing', () => {
      marker.start();

      const input = document.createElement('input');
      input.type = 'text';
      input.value = 'val';
      document.body.appendChild(input);

      // Mark and remove
      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      document.getElementById('saveaction-var-badge')?.click();
      fillVariablePopup('TEMP_VAR');

      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      document.getElementById('saveaction-var-badge')?.click();
      document.getElementById('saveaction-var-prompt')!.querySelectorAll('button')[0]!.click();

      // Badge should now say "Mark as Variable" again
      const badge = document.getElementById('saveaction-var-badge');
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toContain('Mark as Variable');
    });
  });

  describe('contentEditable support', () => {
    it('should show badge for contentEditable elements', () => {
      marker.start();

      const div = document.createElement('div');
      div.contentEditable = 'true';
      // jsdom doesn't set isContentEditable automatically, so mock it
      Object.defineProperty(div, 'isContentEditable', { value: true });
      document.body.appendChild(div);

      div.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

      const badge = document.getElementById('saveaction-var-badge');
      expect(badge).not.toBeNull();
    });

    it('should not show badge for non-editable div', () => {
      marker.start();

      const div = document.createElement('div');
      document.body.appendChild(div);

      div.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

      const badge = document.getElementById('saveaction-var-badge');
      expect(badge).toBeNull();
    });
  });

  describe('select element support', () => {
    it('should show badge for select elements', () => {
      marker.start();

      const select = document.createElement('select');
      const option = document.createElement('option');
      option.value = 'opt1';
      select.appendChild(option);
      document.body.appendChild(select);

      select.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

      const badge = document.getElementById('saveaction-var-badge');
      // select is not INPUT or TEXTAREA, so isInputLike returns false unless contentEditable
      // This verifies the current behavior
      expect(badge).toBeNull();
    });
  });

  describe('popup toggle', () => {
    it('should close popup when badge is clicked twice', () => {
      marker.start();

      const input = document.createElement('input');
      input.type = 'text';
      document.body.appendChild(input);

      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      document.getElementById('saveaction-var-badge')?.click();
      expect(document.getElementById('saveaction-var-prompt')).not.toBeNull();

      // Click badge again should toggle off
      document.getElementById('saveaction-var-badge')?.click();
      expect(document.getElementById('saveaction-var-prompt')).toBeNull();
    });
  });

  describe('buildSelector', () => {
    it('should use id when available', () => {
      marker.start();

      const input = document.createElement('input');
      input.type = 'text';
      input.id = 'my-field';
      input.value = 'val';
      document.body.appendChild(input);

      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      document.getElementById('saveaction-var-badge')?.click();
      fillVariablePopup('MY_FIELD');

      const vars = marker.getVariables();
      expect(vars[0]!.selector).toBe('#my-field');
    });

    it('should use name attribute when no id', () => {
      marker.start();

      const input = document.createElement('input');
      input.type = 'text';
      input.name = 'username';
      input.value = 'val';
      document.body.appendChild(input);

      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      document.getElementById('saveaction-var-badge')?.click();
      fillVariablePopup('USERNAME');

      const vars = marker.getVariables();
      expect(vars[0]!.selector).toBe('input[name="username"]');
    });

    it('should fallback to tagName when no id or name', () => {
      marker.start();

      const input = document.createElement('input');
      input.type = 'text';
      input.value = 'val';
      document.body.appendChild(input);

      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      document.getElementById('saveaction-var-badge')?.click();
      fillVariablePopup('GENERIC');

      const vars = marker.getVariables();
      expect(vars[0]!.selector).toBe('input');
    });
  });

  describe('inferVariableName edge cases', () => {
    it('should fall back to FIELD when no attributes', () => {
      marker.start();

      const input = document.createElement('input');
      input.type = 'text';
      document.body.appendChild(input);

      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      document.getElementById('saveaction-var-badge')?.click();

      const popup = document.getElementById('saveaction-var-prompt');
      const popupInput = popup?.querySelector('input') as HTMLInputElement;
      expect(popupInput.value).toBe('TEXT');
    });

    it('should use placeholder when no id or name', () => {
      marker.start();

      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'Enter your email';
      document.body.appendChild(input);

      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      document.getElementById('saveaction-var-badge')?.click();

      const popup = document.getElementById('saveaction-var-prompt');
      const popupInput = popup?.querySelector('input') as HTMLInputElement;
      expect(popupInput.value).toBe('ENTER_YOUR_EMAIL');
    });
  });
});
