let opener;
const dialog = document.querySelector('#contact-phone-dialog');
if (dialog && typeof dialog.showModal === 'function') {
  document.addEventListener('click', event => {
    const link = event.target.closest('[data-contact-call]');
    if (!link || event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    opener = link;
    if (!dialog.open) dialog.showModal();
  });
  dialog.addEventListener('close', () => opener?.focus({preventScroll:true}));
}
document.addEventListener('click', event => {
  if (!event.target.closest('[data-contact-callback]')) return;
  const inquiry = document.querySelector('#inquiry-dialog');
  if (!inquiry?.open) return;
  const channel = inquiry.querySelector('select[name="channel"]');
  if (channel && channel.value !== 'phone' && [...channel.options].some(option => option.value === 'phone')) {
    channel.value = 'phone';
    channel.dispatchEvent(new Event('input', {bubbles:true}));
  }
});
