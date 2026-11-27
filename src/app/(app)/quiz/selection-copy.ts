export const STYLE_SELECTION_COPY = {
  title: 'What’s already in your wardrobe?',
  description: 'Choose pieces similar to clothes you own. They don’t need to match exactly.',
  selectedCardLabel: 'I own something similar',
  continueWithCount: (count: number) => `Continue with ${count} pieces`,
  emptySelection: 'None of these',
  eligibilityError: 'Please try saving your selection again.',
  submitTitle: 'Preparing your wardrobe...',
  submitBody: 'Your selected pieces will be added to your wardrobe.',
} as const
