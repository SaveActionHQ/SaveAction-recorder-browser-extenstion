import { beforeEach, describe, expect, it } from 'vitest';
import { ModalTracker, findParentModal, generateModalId, isModal } from '@/utils/modal-tracker';

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

  it('should keep generated modal ids stable for the same modal instance', () => {
    const modal = document.createElement('div');
    modal.setAttribute('role', 'dialog');
    modal.style.width = '300px';
    modal.style.height = '200px';

    const firstId = generateModalId(modal);

    modal.style.width = '0px';
    modal.style.height = '0px';

    expect(generateModalId(modal)).toBe(firstId);
  });

  it('should emit open and close for the same SweetAlert modal instance', async () => {
    const events: Array<{ event: string; modalId: string }> = [];
    const tracker = new ModalTracker((event) => {
      events.push({ event: event.event, modalId: event.modalId });
    });

    tracker.start();

    const container = document.createElement('div');
    container.className = 'swal2-container swal2-center';

    const popup = document.createElement('div');
    popup.className = 'swal2-popup swal2-modal';
    popup.setAttribute('role', 'dialog');
    container.appendChild(popup);

    document.body.appendChild(container);
    await new Promise((resolve) => setTimeout(resolve, 0));

    container.remove();
    await new Promise((resolve) => setTimeout(resolve, 120));

    tracker.stop();

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ event: 'modal-opened', modalId: 'modal-swal2-popup-swal2-modal' });
    expect(events[1]).toEqual({ event: 'modal-closed', modalId: 'modal-swal2-popup-swal2-modal' });
  });

  it('should emit modal-opened when a SweetAlert popup becomes visible after insertion', async () => {
    const events: Array<{ event: string; modalId: string }> = [];
    const tracker = new ModalTracker((event) => {
      events.push({ event: event.event, modalId: event.modalId });
    });

    tracker.start();

    const container = document.createElement('div');
    container.className = 'swal2-container swal2-center';

    const popup = document.createElement('div');
    popup.className = 'swal2-popup swal2-modal';
    popup.setAttribute('role', 'dialog');
    popup.style.display = 'none';
    container.appendChild(popup);

    document.body.appendChild(container);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(events).toHaveLength(0);

    popup.style.display = 'block';
    popup.className = 'swal2-popup swal2-modal swal2-show';
    await new Promise((resolve) => setTimeout(resolve, 0));

    tracker.stop();

    expect(events).toEqual([{ event: 'modal-opened', modalId: 'modal-swal2-popup-swal2-modal' }]);
  });

  it('should emit modal-opened when SweetAlert container mutations reveal a hidden popup', async () => {
    const events: Array<{ event: string; modalId: string }> = [];
    const tracker = new ModalTracker((event) => {
      events.push({ event: event.event, modalId: event.modalId });
    });

    tracker.start();

    const container = document.createElement('div');
    container.className = 'swal2-container swal2-center';
    container.style.display = 'none';

    const popup = document.createElement('div');
    popup.className = 'swal2-popup swal2-modal';
    popup.setAttribute('role', 'dialog');
    container.appendChild(popup);

    document.body.appendChild(container);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(events).toHaveLength(0);

    container.style.display = 'block';
    container.className = 'swal2-container swal2-center swal2-backdrop-show';
    await new Promise((resolve) => setTimeout(resolve, 0));

    tracker.stop();

    expect(events).toEqual([{ event: 'modal-opened', modalId: 'modal-swal2-popup-swal2-modal' }]);
  });

  it('should reuse the same modal id across SweetAlert container and popup nodes', () => {
    const container = document.createElement('div');
    container.className = 'swal2-container swal2-center';

    const popup = document.createElement('div');
    popup.className = 'swal2-popup swal2-modal';
    popup.setAttribute('role', 'dialog');
    container.appendChild(popup);

    const containerId = generateModalId(container);
    const popupId = generateModalId(popup);

    expect(containerId).toBe(popupId);
  });

  it('should not emit modal-closed while the same modal session is still visible', async () => {
    const events: Array<{ event: string; modalId: string }> = [];
    const tracker = new ModalTracker((event) => {
      events.push({ event: event.event, modalId: event.modalId });
    });

    tracker.start();

    const container = document.createElement('div');
    container.className = 'swal2-container swal2-center';

    const popup = document.createElement('div');
    popup.className = 'swal2-popup swal2-modal';
    popup.setAttribute('role', 'dialog');
    popup.textContent = 'Confirm';
    container.appendChild(popup);
    document.body.appendChild(container);

    await new Promise((resolve) => setTimeout(resolve, 0));

    const replacementWrapper = document.createElement('div');
    replacementWrapper.className = 'swal2-html-container';
    popup.appendChild(replacementWrapper);
    popup.removeChild(replacementWrapper);

    await new Promise((resolve) => setTimeout(resolve, 120));

    tracker.stop();
    container.remove();

    expect(events.filter((event) => event.event === 'modal-closed')).toHaveLength(0);
  });
});
