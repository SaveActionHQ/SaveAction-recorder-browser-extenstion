import { beforeEach, describe, expect, it } from 'vitest';
import { findParentModal, generateModalId, isModal } from '@/utils/modal-tracker';

describe('modal-tracker', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('should detect popup body containers as modals', () => {
    const modal = document.createElement('div');
    modal.className = 'popup__body';

    expect(isModal(modal)).toBe(true);
    expect(generateModalId(modal)).toBe('modal-popup__body');
  });

  it('should not treat popup close controls as modal containers', () => {
    const closeControl = document.createElement('span');
    closeControl.className = 'popup__close search-recommend-item-delete';

    expect(isModal(closeControl)).toBe(false);
  });

  it('should resolve popup close controls to the containing popup body', () => {
    const wrapper = document.createElement('div');
    wrapper.id = 'iframe';
    wrapper.style.position = 'fixed';
    wrapper.style.zIndex = '2000';
    wrapper.style.width = '1200px';
    wrapper.style.height = '800px';

    const modal = document.createElement('div');
    modal.className = 'popup__body';

    const header = document.createElement('div');
    header.className = 'popup__header';

    const closeControl = document.createElement('span');
    closeControl.className = 'popup__close search-recommend-item-delete';
    header.appendChild(closeControl);

    wrapper.appendChild(header);
    wrapper.appendChild(modal);
    document.body.appendChild(wrapper);

    const parentModal = findParentModal(closeControl);

    expect(parentModal).toBe(modal);
    expect(parentModal ? generateModalId(parentModal) : null).toBe('modal-popup__body');
  });
});
