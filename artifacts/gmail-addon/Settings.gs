/**
 * Settings card — shown on the add-on homepage.
 * Stores CRM API URL and API token in UserProperties so they
 * persist across sessions without being hard-coded.
 */

var PROP_API_URL = 'crm_api_url';
var PROP_API_TOKEN = 'crm_api_token';

function getSavedUrl() {
  return PropertiesService.getUserProperties().getProperty(PROP_API_URL) || '';
}

function getSavedToken() {
  return PropertiesService.getUserProperties().getProperty(PROP_API_TOKEN) || '';
}

function onHomepage(e) {
  return buildSettingsCard();
}

function buildSettingsCard() {
  var savedUrl = getSavedUrl();
  var savedToken = getSavedToken();
  var isConfigured = savedUrl && savedToken;

  var card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle('Ennabl CRM')
      .setSubtitle('Settings'));

  var statusSection = CardService.newCardSection();
  if (isConfigured) {
    statusSection.addWidget(CardService.newDecoratedText()
      .setText('✓ Connected to ' + savedUrl)
      .setWrapText(true));
  } else {
    statusSection.addWidget(CardService.newDecoratedText()
      .setText('⚠ Not configured. Enter your CRM URL and API token below.')
      .setWrapText(true));
  }
  card.addSection(statusSection);

  var formSection = CardService.newCardSection()
    .setHeader('Configuration');

  formSection.addWidget(CardService.newTextInput()
    .setFieldName('api_url')
    .setTitle('CRM API URL')
    .setHint('e.g. https://crm.ennabl.com/api')
    .setValue(savedUrl));

  formSection.addWidget(CardService.newTextInput()
    .setFieldName('api_token')
    .setTitle('API Token')
    .setHint('Your personal API token from CRM Settings')
    .setValue(savedToken));

  formSection.addWidget(CardService.newTextButton()
    .setText('Save')
    .setOnClickAction(CardService.newAction().setFunctionName('onSaveSettings')));

  if (isConfigured) {
    formSection.addWidget(CardService.newTextButton()
      .setText('Clear / Disconnect')
      .setOnClickAction(CardService.newAction().setFunctionName('onClearSettings')));
  }

  card.addSection(formSection);

  var helpSection = CardService.newCardSection()
    .setHeader('How it works');
  helpSection.addWidget(CardService.newDecoratedText()
    .setText('When you compose an email to a contact in Ennabl CRM, this add-on automatically adds a BCC tracking address. The email is then logged to the contact\'s record automatically.')
    .setWrapText(true));
  card.addSection(helpSection);

  return card.build();
}

function onSaveSettings(e) {
  var apiUrl = (e.formInputs['api_url'] || [''])[0].trim().replace(/\/$/, '');
  var apiToken = (e.formInputs['api_token'] || [''])[0].trim();

  if (!apiUrl || !apiToken) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification()
        .setText('Both CRM URL and API Token are required.'))
      .build();
  }

  PropertiesService.getUserProperties().setProperties({
    [PROP_API_URL]: apiUrl,
    [PROP_API_TOKEN]: apiToken
  });

  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification()
      .setText('Settings saved. Ennabl CRM is now connected.'))
    .setNavigation(CardService.newNavigation().updateCard(buildSettingsCard()))
    .build();
}

function onClearSettings() {
  PropertiesService.getUserProperties().deleteAllProperties();

  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification()
      .setText('Disconnected from Ennabl CRM.'))
    .setNavigation(CardService.newNavigation().updateCard(buildSettingsCard()))
    .build();
}
