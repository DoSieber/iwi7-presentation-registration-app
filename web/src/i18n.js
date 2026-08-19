export const LANGUAGES = ['de', 'en'];

export const strings = {
  de: {
    htmlLang: 'de',
    title: 'Anmeldung Abschlusspräsentation',
    intro:
      'Wählen Sie einen Termin und melden Sie sich an. Die genaue Präsentationszeit erhalten Sie einige Tage vorher per E-Mail. Anwesenheitspflicht besteht für den gesamten Termin, nicht nur für die eigene Präsentation.',
    loading: 'Termine werden geladen …',
    loadError: 'Die Termine konnten nicht geladen werden. Bitte laden Sie die Seite neu.',
    retry: 'Erneut versuchen',
    noSessions: 'Zurzeit sind keine freien Plätze verfügbar. Bitte schauen Sie später noch einmal vorbei.',
    sessionsHeading: 'Freie Termine',
    placesFree: (free, total) =>
      free === 1 ? `noch 1 von ${total} Plätzen frei` : `noch ${free} von ${total} Plätzen frei`,
    lastPlace: 'letzter freier Platz',
    select: 'Auswählen',
    selected: 'Ausgewählt',
    changeSession: 'Termin ändern',
    room: 'Raum',
    supervisor: 'Betreuung',
    attendance: 'Anwesenheit',
    attendanceWhole: 'gesamter Termin',
    timeHint:
      'Die genaue Präsentationszeit teilen wir Ihnen mit der Kalendereinladung mit. Bitte halten Sie sich den ganzen Termin frei.',
    deadlineNote: (days) =>
      `Die Anmeldung schliesst ${days} Tage vor dem Termin. Danach erhalten alle Angemeldeten eine Kalendereinladung mit der genauen Zeit.`,
    formHeading: 'Ihre Angaben',
    firstName: 'Vorname',
    lastName: 'Nachname',
    email: 'E-Mail',
    matriculation: 'Matrikelnummer',
    thesisType: 'Art der Arbeit',
    bachelor: 'Bachelorarbeit',
    master: 'Masterarbeit',
    presentationType: 'Art der Präsentation',
    interim: 'Zwischenpräsentation',
    final: 'Abschlusspräsentation',
    thesisTitle: 'Titel der Arbeit',
    supervisorLabel: 'Betreuende Person',
    choose: 'Bitte wählen',
    consent:
      'Ich bin damit einverstanden, dass meine Angaben zur Organisation der Präsentation gespeichert werden.',
    submit: 'Verbindlich anmelden',
    submitting: 'Wird gesendet …',
    successHeading: 'Anmeldung bestätigt',
    successIntro: 'Ihr Termin',
    successAttendance: 'Bitte halten Sie sich den gesamten Termin frei',
    successNote:
      'Die Kalendereinladung mit der genauen Präsentationszeit erhalten Sie nach Anmeldeschluss. Bitte notieren Sie sich das Datum.',
    newRegistration: 'Weitere Anmeldung',
    errRequired: 'Pflichtfeld',
    errEmail: 'Bitte eine gültige E-Mail-Adresse eingeben',
    errEmailDomain: 'Bitte verwenden Sie Ihre Universitäts-E-Mail-Adresse.',
    errConsent: 'Bitte bestätigen Sie die Einwilligung',
    errSessionFull:
      'Für diesen Nachmittag ist der letzte Platz soeben vergeben worden. Bitte wählen Sie einen anderen Termin.',
    errAlreadyRegistered:
      'Unter dieser E-Mail-Adresse besteht bereits eine Anmeldung. Bitte wenden Sie sich an das Sekretariat, wenn Sie den Termin ändern möchten.',
    errInvalidSupervisor:
      'Die gewählte betreuende Person steht nicht mehr zur Verfügung. Bitte laden Sie die Seite neu und wählen Sie erneut.',
    errTryAgain:
      'Gerade hat jemand zeitgleich gebucht. Bitte senden Sie das Formular noch einmal ab.',
    errDeadlinePassed:
      'Die Anmeldefrist für diesen Termin ist abgelaufen. Bitte laden Sie die Seite neu.',
    errRateLimited: 'Zu viele Versuche. Bitte warten Sie einige Minuten.',
    errCaptcha: 'Die Bot-Prüfung ist fehlgeschlagen. Bitte erneut versuchen.',
    errGeneric: 'Die Anmeldung ist fehlgeschlagen. Bitte versuchen Sie es später erneut.',
    langLabel: 'Sprache',
  },
  en: {
    htmlLang: 'en',
    title: 'Final Presentation Registration',
    intro:
      'Pick a date and register. Your exact presentation time follows by email a few days beforehand. Attendance is required for the whole session, not only for your own presentation.',
    loading: 'Loading dates …',
    loadError: 'The dates could not be loaded. Please reload the page.',
    retry: 'Try again',
    noSessions: 'No places are available right now. Please check back later.',
    sessionsHeading: 'Available afternoons',
    placesFree: (free, total) =>
      free === 1 ? `1 of ${total} places left` : `${free} of ${total} places left`,
    lastPlace: 'last place',
    select: 'Select',
    selected: 'Selected',
    changeSession: 'Change date',
    room: 'Room',
    supervisor: 'Supervisor',
    attendance: 'Attendance',
    attendanceWhole: 'whole session',
    timeHint:
      'Your exact presentation time comes with the calendar invitation. Please keep the whole session free.',
    deadlineNote: (days) =>
      `Registration closes ${days} days before the session. Everyone registered then receives a calendar invitation with their exact time.`,
    formHeading: 'Your details',
    firstName: 'First name',
    lastName: 'Last name',
    email: 'Email',
    matriculation: 'Student ID',
    thesisType: 'Type of thesis',
    bachelor: "Bachelor's thesis",
    master: "Master's thesis",
    presentationType: 'Type of presentation',
    interim: 'Interim presentation',
    final: 'Final presentation',
    thesisTitle: 'Thesis title',
    supervisorLabel: 'Supervisor',
    choose: 'Please choose',
    consent:
      'I agree that my details are stored for the organisation of the presentation.',
    submit: 'Register',
    submitting: 'Sending …',
    successHeading: 'Registration confirmed',
    successIntro: 'Your session',
    successAttendance: 'Please keep the whole session free',
    successNote:
      'The calendar invitation with your exact presentation time follows once registration closes. Please note the date.',
    newRegistration: 'Register someone else',
    errRequired: 'Required',
    errEmail: 'Please enter a valid email address',
    errEmailDomain: 'Please use your university email address.',
    errConsent: 'Please confirm the consent',
    errSessionFull:
      'The last place for that afternoon was just taken. Please choose another date.',
    errAlreadyRegistered:
      'A registration already exists for this email address. Please contact the secretariat if you need to change your slot.',
    errInvalidSupervisor:
      'The selected supervisor is no longer available. Please reload the page and choose again.',
    errTryAgain:
      'Someone booked at the same moment. Please submit the form once more.',
    errDeadlinePassed:
      'The registration deadline for that session has passed. Please reload the page.',
    errRateLimited: 'Too many attempts. Please wait a few minutes.',
    errCaptcha: 'The bot check failed. Please try again.',
    errGeneric: 'Registration failed. Please try again later.',
    langLabel: 'Language',
  },
};

const LOCALES = { de: 'de-CH', en: 'en-GB' };

export function formatDate(isoDate, lang, style = 'long') {
  const day = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(day.getTime())) return isoDate;
  return day.toLocaleDateString(LOCALES[lang] || 'de-CH', {
    weekday: style === 'long' ? 'long' : 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}


