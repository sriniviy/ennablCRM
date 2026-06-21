/**
 * Ennabl CRM — Gmail Add-on (Google Workspace Add-on)
 *
 * Compose trigger: fires when a compose window opens.
 * - Checks each recipient (To + CC) against CRM contacts via /contacts/by-email/:email
 * - If a match is found, injects {contactId}@mail.ennabl.com into BCC
 * - Shows a sidebar card with contact info and "Logging to CRM" status
 *
 * Contextual trigger: fires when reading an email thread.
 * - Shows matched contact info from the sender/recipients
 *
 * Deploy as a private Google Workspace Add-on (no Marketplace publishing needed).
 * See README.md for deployment steps.
 */

var MAIL_DOMAIN = 'mail.ennabl.com';

// ─── Compose trigger ──────────────────────────────────────────────────────────

function onComposeOpen(e) {
  var apiUrl = getSavedUrl();
  var apiToken = getSavedToken();

  if (!apiUrl || !apiToken) {
    return buildSetupPromptCard();
  }

  var recipients = getComposeRecipients(e);
  if (recipients.length === 0) {
    return buildWaitingCard();
  }

  var matchedContacts = [];
  for (var i = 0; i < recipients.length; i++) {
    var contact = lookupContact(apiUrl, apiToken, recipients[i]);
    if (contact) matchedContacts.push(contact);
  }

  if (matchedContacts.length === 0) {
    return buildNoMatchCard(recipients);
  }

  // Inject BCC for each matched contact
  var bccAddresses = matchedContacts.map(function(c) {
    return c.id + '@' + MAIL_DOMAIN;
  });

  var response = CardService.newComposeActionResponseBuilder();

  // Build draft update — add BCC addresses
  var draftUpdate = CardService.newUpdateDraftActionResponseBuilder()
    .addUpdateToBccRecipients(CardService.newUpdateDraftBccRecipientsAction()
      .addUpdateBccRecipients(bccAddresses));

  return draftUpdate.build();
}

// Called when the "Ennabl CRM" button is clicked from compose toolbar
function onComposeAction(e) {
  var apiUrl = getSavedUrl();
  var apiToken = getSavedToken();

  if (!apiUrl || !apiToken) {
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().pushCard(buildSetupPromptCard()))
      .build();
  }

  var recipients = getComposeRecipients(e);
  var matchedContacts = [];
  for (var i = 0; i < recipients.length; i++) {
    var contact = lookupContact(apiUrl, apiToken, recipients[i]);
    if (contact) matchedContacts.push(contact);
  }

  var card = buildComposeCard(matchedContacts, recipients);
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(card))
    .build();
}

// ─── Contextual trigger (reading a thread) ───────────────────────────────────

function onGmailMessage(e) {
  var apiUrl = getSavedUrl();
  var apiToken = getSavedToken();

  if (!apiUrl || !apiToken) {
    return buildSetupPromptCard();
  }

  var message = e.gmail.messageMetadata;
  var fromEmail = message ? extractEmail(message.from) : null;

  if (!fromEmail) return buildWaitingCard();

  var contact = lookupContact(apiUrl, apiToken, fromEmail);
  return buildMessageCard(contact, fromEmail, apiUrl);
}

// ─── Card builders ────────────────────────────────────────────────────────────

function buildSetupPromptCard() {
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('Ennabl CRM'))
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newDecoratedText()
        .setText('⚠ Please configure your CRM connection in the Ennabl CRM homepage.')
        .setWrapText(true))
      .addWidget(CardService.newTextButton()
        .setText('Open Settings')
        .setOnClickAction(CardService.newAction().setFunctionName('onHomepage'))))
    .build();
}

function buildWaitingCard() {
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('Ennabl CRM'))
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newDecoratedText()
        .setText('Add recipients to check for CRM contacts.')
        .setWrapText(true)))
    .build();
}

function buildNoMatchCard(emails) {
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('Ennabl CRM'))
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newDecoratedText()
        .setText('No CRM contacts found for: ' + emails.join(', '))
        .setWrapText(true))
      .addWidget(CardService.newDecoratedText()
        .setText('Email will not be tracked automatically.')
        .setWrapText(true)))
    .build();
}

function buildComposeCard(matchedContacts, allRecipients) {
  var card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle('Ennabl CRM')
      .setSubtitle(matchedContacts.length > 0
        ? '✓ Logging to CRM'
        : 'No CRM contacts found'));

  if (matchedContacts.length > 0) {
    var section = CardService.newCardSection()
      .setHeader('Contacts being tracked');

    matchedContacts.forEach(function(c) {
      var name = (c.firstName || '') + ' ' + (c.lastName || '');
      var bcc = c.id + '@' + MAIL_DOMAIN;
      section.addWidget(CardService.newDecoratedText()
        .setTopLabel(c.companyName || 'Unknown company')
        .setText(name.trim() || c.email)
        .setBottomLabel('BCC: ' + bcc)
        .setWrapText(true));
    });

    card.addSection(section);

    var infoSection = CardService.newCardSection();
    infoSection.addWidget(CardService.newDecoratedText()
      .setText('BCC addresses have been added automatically. This email will appear in the contact\'s Email tab once sent.')
      .setWrapText(true));
    card.addSection(infoSection);
  } else {
    var noMatchSection = CardService.newCardSection();
    noMatchSection.addWidget(CardService.newDecoratedText()
      .setText('None of the recipients (' + allRecipients.join(', ') + ') are in Ennabl CRM. Email will not be tracked.')
      .setWrapText(true));
    card.addSection(noMatchSection);
  }

  return card.build();
}

function buildMessageCard(contact, fromEmail, apiUrl) {
  var card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('Ennabl CRM'));

  if (contact) {
    var name = ((contact.firstName || '') + ' ' + (contact.lastName || '')).trim();
    var crmUrl = apiUrl.replace('/api', '') + '/contacts/' + contact.id;

    card.addSection(CardService.newCardSection()
      .setHeader('Contact found')
      .addWidget(CardService.newDecoratedText()
        .setTopLabel(contact.companyName || '')
        .setText(name || fromEmail)
        .setBottomLabel(fromEmail)
        .setWrapText(true))
      .addWidget(CardService.newTextButton()
        .setText('View in CRM')
        .setOpenLink(CardService.newOpenLink().setUrl(crmUrl))));
  } else {
    card.addSection(CardService.newCardSection()
      .addWidget(CardService.newDecoratedText()
        .setText(fromEmail + ' is not in Ennabl CRM.')
        .setWrapText(true)));
  }

  return card.build();
}

// ─── API helpers ──────────────────────────────────────────────────────────────

function lookupContact(apiUrl, apiToken, email) {
  try {
    var url = apiUrl + '/contacts/by-email/' + encodeURIComponent(email);
    var response = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: { Authorization: 'Bearer ' + apiToken },
      muteHttpExceptions: true,
    });
    if (response.getResponseCode() !== 200) return null;
    return JSON.parse(response.getContentText());
  } catch (e) {
    return null;
  }
}

function getComposeRecipients(e) {
  var emails = [];
  try {
    var draft = e.gmail && e.gmail.draftMetadata;
    if (draft) {
      var to = draft.toRecipients || [];
      var cc = draft.ccRecipients || [];
      [].concat(to, cc).forEach(function(addr) {
        var email = extractEmail(addr);
        if (email) emails.push(email);
      });
    }
  } catch (err) { /* no recipients yet */ }
  return emails;
}

function extractEmail(raw) {
  if (!raw) return null;
  var match = raw.match(/<([^>]+)>/) || raw.match(/(\S+@\S+)/);
  return match ? match[1].toLowerCase().trim() : raw.toLowerCase().trim();
}
