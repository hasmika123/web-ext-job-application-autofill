/**
 * Kiwiply organization setup: the intake form sent to a consultancy before we create its organization
 * (ONBOARDING-RUNBOOK.md step 0). Google Apps Script: paste into a new project at script.google.com and run
 * createKiwiplyOnboardingForm(). It creates the form plus a linked responses sheet in the runner's Drive and logs both links.
 *
 * Only what we need BEFORE the organization exists is asked here. Departments, staff invites, the consultant roster,
 * assignments and licences are done by the owner in the workspace (runbook section 2), so they are not on the form.
 * Never ask for sensitive PII (CLAUDE.md): no SSN/ITIN, tax IDs, bank/card numbers, passport/visa numbers or dates of birth.
 */
function createKiwiplyOnboardingForm() {
  var form = FormApp.create('Kiwiply organization setup');
  form.setDescription(
    'Thanks for choosing Kiwiply! This form gives us what we need to set up your organization\'s workspace. ' +
    'It takes about 10 minutes, and you can change almost everything here later from your workspace settings.\n\n' +
    'Please do not include Social Security numbers, tax IDs, bank or card details, passport or visa numbers, or dates of birth. ' +
    'We never ask for them. Payment details are entered directly with Stripe, never on this form.'
  );
  form.setProgressBar(true);
  form.setAllowResponseEdits(true);
  form.setConfirmationMessage(
    'Thank you! We\'ll review your answers, set up your workspace and get in touch with next steps. ' +
    'The owner\'s first sign-in details will arrive in a separate email.'
  );

  var email = function () { return FormApp.createTextValidation().requireTextIsEmail().build(); };
  var hex = function () {
    return FormApp.createTextValidation().requireTextMatchesPattern('^#?[0-9A-Fa-f]{6}$')
      .setHelpText('Use a 6-digit hex color, for example #1F7A4D.').build();
  };
  var wholeNumber = function () {
    return FormApp.createTextValidation().requireWholeNumber()
      .setHelpText('Please enter a whole number (0 is fine).').build();
  };
  var label = function () {
    return FormApp.createTextValidation().requireTextMatchesPattern('^[a-z0-9]([a-z0-9]|-[a-z0-9]){1,61}$')
      .setHelpText('Lowercase letters, numbers and single hyphens only; start and end with a letter or number.').build();
  };

  // 1. About you
  form.addSectionHeaderItem().setTitle('About you and your company');
  form.addTextItem().setTitle('Your full name').setRequired(true);
  form.addTextItem().setTitle('Your email').setRequired(true).setValidation(email());
  form.addTextItem().setTitle('Your role at the company').setHelpText('For example: Founder, Operations Manager.');
  form.addTextItem().setTitle('Company name').setRequired(true)
    .setHelpText('The name of your consultancy as it should appear in Kiwiply.');
  form.addTextItem().setTitle('Company website');
  form.addTextItem().setTitle('Country and state / region your company is based in').setRequired(true);

  // 2. Kiwiply address
  var pAddress = form.addPageBreakItem().setTitle('Your Kiwiply address')
    .setHelpText('Your team signs in at your own address, for example acme.kiwiply.com.');
  form.addTextItem().setTitle('Preferred address name').setRequired(true).setValidation(label())
    .setHelpText('This becomes yourname.kiwiply.com. At least 3 characters: lowercase letters, numbers and single hyphens.');
  form.addTextItem().setTitle('Second choice, in case the first is taken').setRequired(true).setValidation(label());
  form.addMultipleChoiceItem().setTitle('Would you want your own web address later (for example jobs.yourcompany.com)?')
    .setHelpText('This is not available yet. We\'ll let you know when it is.')
    .setChoiceValues(['Yes, as soon as it\'s available', 'Maybe later', 'No, the Kiwiply address is fine']);

  // 3. Branding (branches)
  var pBranding = form.addPageBreakItem().setTitle('Branding')
    .setHelpText('Your workspace can show your logo and colors. You can change them any time later.');
  var brandingChoice = form.addMultipleChoiceItem().setTitle('Would you like us to set up your branding ahead of time?')
    .setRequired(true);

  var pBrandingDetails = form.addPageBreakItem().setTitle('Branding details')
    .setHelpText('Fill in what you have. Anything you skip, you can add yourself after you sign in.');
  form.addTextItem().setTitle('Name to show at the top of your workspace')
    .setHelpText('Leave blank to use your company name.');
  form.addTextItem().setTitle('Link to your logo')
    .setHelpText('A shareable link (Google Drive, Dropbox or your website). Or email the file to support@kiwiply.com with your ' +
      'company name in the subject. A PNG or SVG with a transparent background works best.');
  form.addTextItem().setTitle('Main brand color (hex)').setValidation(hex());
  form.addTextItem().setTitle('Second brand color (hex)').setValidation(hex());
  form.addParagraphTextItem().setTitle('Anything else about your brand we should know?');

  // 4. Owner account
  var pOwner = form.addPageBreakItem().setTitle('Organization owner')
    .setHelpText('The owner gets the first sign-in and full admin rights, and can add other admins later.');
  form.addTextItem().setTitle('Owner\'s full name').setRequired(true);
  form.addTextItem().setTitle('Owner\'s email for Kiwiply').setRequired(true).setValidation(email())
    .setHelpText('The owner signs in with this email. It can be the same email as a personal Kiwiply account: the two stay completely separate.');
  form.addTextItem().setTitle('Owner\'s job title');
  form.addTextItem().setTitle('Owner\'s phone number (optional)').setHelpText('Only used if we have a question during setup.');

  // 5. Team and accounts
  form.addPageBreakItem().setTitle('Your team and their accounts');
  // No sign-in questions: the org admin creates each account in the workspace (decision O2), and there is no SSO for tenants.
  form.addMultipleChoiceItem().setTitle('How would you like to add your team?').setRequired(true)
    .setChoiceValues([
      'We\'ll create our team\'s accounts ourselves in the workspace',
      'We\'d like Kiwiply to help with the first setup',
      'Not sure yet'
    ]);
  form.addTextItem().setTitle('How many consultants to start with?').setRequired(true).setValidation(wholeNumber());
  form.addTextItem().setTitle('How many marketers / recruiters to start with?').setRequired(true).setValidation(wholeNumber());
  form.addTextItem().setTitle('How many admins to start with (including the owner)?').setRequired(true).setValidation(wholeNumber());
  form.addTextItem().setTitle('About how many consultants do you expect in 6 months?').setValidation(wholeNumber());
  form.addParagraphTextItem().setTitle('Departments or teams you\'d like set up (optional)')
    .setHelpText('For example: Java, Data, DevOps. You can also create these yourself later.');

  // 6. Features
  form.addPageBreakItem().setTitle('What you\'ll use Kiwiply for')
    .setHelpText('Kiwiply fills in applications and gets them ready, but never submits them. Your consultants always review and press Submit themselves.');
  form.addCheckboxItem().setTitle('Which features are you interested in?')
    .setChoiceValues([
      'Autofill for job applications (browser extension)',
      'AI resume tailoring for each job',
      'Job discovery and assigning jobs to consultants',
      'Inbox tracking (each consultant connects a dedicated Gmail)',
      'Autopilot: prepare many applications at once for review',
      'Interview preparation',
      'Not sure yet, please walk us through it'
    ]);
  form.addCheckboxItem().setTitle('Where do your consultants apply most often?')
    .setHelpText('This helps us make sure autofill works well on the sites you use.')
    .setChoiceValues(['Workday', 'Greenhouse', 'Lever', 'iCIMS', 'SmartRecruiters', 'Oracle Taleo', 'LinkedIn', 'Dice', 'Indeed'])
    .showOtherOption(true);
  form.addDateItem().setTitle('When would you like to start using Kiwiply?');

  // 7. Training (branches)
  var pTraining = form.addPageBreakItem().setTitle('Training');
  var trainingChoice = form.addMultipleChoiceItem().setTitle('Would you like live training sessions for your team?').setRequired(true);

  var pTrainingDetails = form.addPageBreakItem().setTitle('Training details');
  form.addCheckboxItem().setTitle('Who should attend?').setRequired(true)
    .setChoiceValues(['Owner and admins', 'Marketers / recruiters', 'Consultants', 'HR or operations staff']);
  form.addTextItem().setTitle('About how many people will attend?').setValidation(wholeNumber());
  form.addDateItem().setTitle('Preferred date (first choice)').setRequired(true);
  form.addDateItem().setTitle('Preferred date (second choice)');
  form.addCheckboxItem().setTitle('Preferred time of day').setRequired(true)
    .setChoiceValues(['Morning (9 am - 12 pm)', 'Midday (12 - 3 pm)', 'Afternoon (3 - 6 pm)', 'Flexible']);
  form.addListItem().setTitle('Your time zone').setRequired(true)
    .setChoiceValues([
      'Eastern (ET)', 'Central (CT)', 'Mountain (MT)', 'Arizona (MST)', 'Pacific (PT)', 'Alaska (AKT)', 'Hawaii (HT)',
      'India (IST)', 'UK (GMT / BST)', 'Central Europe (CET)', 'Other (tell us in the notes below)'
    ]);
  form.addMultipleChoiceItem().setTitle('Preferred video call tool')
    .setChoiceValues(['Google Meet', 'Zoom', 'Microsoft Teams', 'No preference']);
  form.addMultipleChoiceItem().setTitle('May we record the session for people who can\'t attend?')
    .setChoiceValues(['Yes', 'No']);
  form.addParagraphTextItem().setTitle('Anything you\'d like the training to cover?');

  // 8. Billing
  var pBilling = form.addPageBreakItem().setTitle('Billing and payment')
    .setHelpText('Your plan has a one-time setup fee plus a license per consultant, with optional add-ons. ' +
      'We\'ll send you a written quote before anything is charged. Please don\'t enter card or bank details here.');
  form.addMultipleChoiceItem().setTitle('Payments are in US dollars (USD) and processed securely by Stripe. Does that work for you?')
    .setRequired(true)
    .setChoiceValues(['Yes', 'No, we need a different option (tell us in the notes below)']);
  form.addMultipleChoiceItem().setTitle('How often would you like to be billed?').setRequired(true)
    .setChoiceValues(['Monthly', 'Yearly', 'Not sure, let\'s discuss']);
  form.addMultipleChoiceItem().setTitle('How would you prefer to pay?')
    .setChoiceValues(['Card, charged automatically (via Stripe)', 'Invoice we pay online (via Stripe)', 'Not sure, let\'s discuss']);
  form.addParagraphTextItem().setTitle('Billing notes or questions');

  // 9. Wrap-up
  form.addPageBreakItem().setTitle('Almost done');
  form.addMultipleChoiceItem().setTitle('How did you hear about Kiwiply?')
    .setChoiceValues(['Referral', 'Search', 'LinkedIn', 'Event'])
    .showOtherOption(true);
  form.addParagraphTextItem().setTitle('Anything else we should know, or questions for us?');
  form.addCheckboxItem().setTitle('Please confirm').setRequired(true)
    .setChoiceValues([
      'We understand Kiwiply prepares applications but never submits them. Our consultants review and submit every application themselves.',
      'We won\'t send Social Security numbers, tax IDs, bank or card details, passport or visa numbers, or dates of birth through Kiwiply.'
    ])
    .setValidation(FormApp.createCheckboxValidation().requireSelectExactly(2)
      .setHelpText('Please tick both boxes.').build());

  // Branching: "No" skips the details page.
  brandingChoice.setChoices([
    brandingChoice.createChoice('Yes, please set it up for us', pBrandingDetails),
    brandingChoice.createChoice('No, we\'ll do it ourselves after signing in', pOwner)
  ]);
  trainingChoice.setChoices([
    trainingChoice.createChoice('Yes, please', pTrainingDetails),
    trainingChoice.createChoice('No, thanks', pBilling)
  ]);

  // Responses land in a linked Google Sheet.
  var sheet = SpreadsheetApp.create('Kiwiply organization setup (responses)');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, sheet.getId());

  Logger.log('Edit the form:   ' + form.getEditUrl());
  Logger.log('Send this link:  ' + form.getPublishedUrl());
  Logger.log('Responses sheet: ' + sheet.getUrl());
}
