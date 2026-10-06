<script setup lang="ts">
import { useI18n } from "vue-i18n";

import FlowFrame from "../components/FlowFrame.vue";
import { maintainerName, repoUrl, upstreamAuthor, upstreamName, upstreamUrl } from "../brand";

// The privacy policy (issue #32). Google requires one, with the Limited Use
// statement, for OAuth clients that access contacts.
const { locale } = useI18n();
const effective = "2026-10-03";
const issues = `${repoUrl}/issues`;
const userDataPolicy = "https://developers.google.com/terms/api-services-user-data-policy";
</script>

<template>
  <FlowFrame step="privacy" wide>
    <article v-if="locale === 'it'" lang="it" class="prose max-w-none prose-headings:tracking-tight" data-testid="privacy">
      <h1>Informativa sulla privacy</h1>
      <p class="lead">In vigore dal {{ effective }}.</p>
      <p>
        Social Contacts Sync è un software open source mantenuto da {{ maintainerName }} e basato su
        <a :href="upstreamUrl" target="_blank" rel="noopener">{{ upstreamName }}</a> di {{ upstreamAuthor }}. Lo usi sul tuo computer (app desktop)
        o su un server che gestisci tu (versione web). Chi mantiene il progetto non gestisce alcun servizio e non riceve i tuoi dati.
      </p>

      <h2>App desktop</h2>
      <p>Tutto resta nella cartella dei dati sul tuo computer (la vedi in <em>Impostazioni → Dati e privacy</em>):</p>
      <ul>
        <li><code>config.env</code>: le credenziali del tuo progetto Google e le preferenze;</li>
        <li>gli accessi a Google e Telegram, cifrati con il portachiavi del sistema operativo, e la sessione di WhatsApp come dispositivo collegato;</li>
        <li>la cronologia delle sincronizzazioni e i backup della pulizia (foto e dati dei contatti modificati), conservati per 90 giorni per poterli annullare;</li>
        <li>le scelte della pulizia (per esempio i gruppi segnati come «non duplicati»), quali contatti hanno una foto caricata a mano dalla pagina Contatti, e i log dell'app.</li>
      </ul>
      <p>L'app si collega solo a:</p>
      <ul>
        <li><strong>Google</strong>, per l'accesso e per leggere e aggiornare i tuoi contatti (People API);</li>
        <li><strong>WhatsApp Web</strong>, per leggere le foto profilo dei tuoi contatti;</li>
        <li><strong>Telegram</strong>, se accedi: legge solo i tuoi contatti Telegram esistenti e le loro foto, senza aggiungere nulla al tuo account;</li>
        <li><strong>Gravatar</strong>, se attivi questa sorgente: riceve l'hash SHA-256 degli indirizzi email dei contatti, non gli indirizzi;</li>
        <li><strong>i siti dei link ai profili</strong> salvati nei tuoi contatti (per esempio X, Telegram, YouTube, Bluesky, Mastodon, GitHub e, solo se lo attivi, Instagram, Facebook e LinkedIn), se attivi questa sorgente: l'app apre la pagina pubblica del profilo, senza accesso e senza inviare altri dati dei contatti, per leggerne la foto;</li>
        <li><strong>GitHub</strong>, per controllare se c'è una nuova versione;</li>
        <li><strong>Google (Chrome for Testing)</strong>, una sola volta, per scaricare un browser se non ne trova uno installato.</li>
      </ul>
      <p>Non ci sono statistiche d'uso, telemetria né pubblicità.</p>

      <h2>Versione web (self-hosted)</h2>
      <p>
        Chi gestisce il server è responsabile dei dati che vi passano. Il software tiene la sessione in memoria (accessi, cronologia delle ultime
        sincronizzazioni) e la cancella alla scadenza; usa un solo cookie di sessione. Google Analytics è attivo solo se chi gestisce il server lo
        configura esplicitamente.
      </p>

      <h2>Dati degli utenti Google</h2>
      <p>
        L'app legge e aggiorna i tuoi contatti Google solo per le azioni che avvii tu: sincronizzare le foto, la pulizia dei contatti e il loro
        annullamento. Questi dati non vengono condivisi, venduti né usati per pubblicità.
      </p>
      <p>
        L'uso e il trasferimento ad altre app delle informazioni ricevute dalle API di Google rispetteranno le
        <a :href="userDataPolicy" target="_blank" rel="noopener">Google API Services User Data Policy</a>, inclusi i requisiti di Limited Use.
      </p>

      <h2>Cancellare i tuoi dati</h2>
      <ul>
        <li>Nell'app: <em>Impostazioni → Dati e privacy → Elimina tutti i dati locali</em>, oppure <em>Esci</em> da Google e Telegram e <em>Scollega</em> WhatsApp.</li>
        <li>Da Google: rimuovi l'accesso in <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener">myaccount.google.com/permissions</a>.</li>
        <li>Da WhatsApp: <em>Impostazioni → Dispositivi collegati</em> sul telefono.</li>
      </ul>

      <h2>Modifiche e contatti</h2>
      <p>
        Le modifiche a questa informativa sono pubblicate qui e nella cronologia del progetto su GitHub. Per domande, apri una issue su
        <a :href="issues" target="_blank" rel="noopener">GitHub</a>.
      </p>
    </article>

    <article v-else lang="en" class="prose max-w-none prose-headings:tracking-tight" data-testid="privacy">
      <h1>Privacy Policy</h1>
      <p class="lead">Effective {{ effective }}.</p>
      <p>
        Social Contacts Sync is open-source software maintained by {{ maintainerName }}, based on
        <a :href="upstreamUrl" target="_blank" rel="noopener">{{ upstreamName }}</a> by {{ upstreamAuthor }}. You run it on your own computer (desktop
        app) or on a server you operate (web version). The maintainer runs no service and receives none of your data.
      </p>

      <h2>Desktop app</h2>
      <p>Everything stays in the data folder on your computer (shown in <em>Settings → Data &amp; privacy</em>):</p>
      <ul>
        <li><code>config.env</code>: your own Google project's credentials and your preferences;</li>
        <li>your Google and Telegram sign-ins, encrypted with the operating system's keychain, and WhatsApp's linked-device session;</li>
        <li>sync history and clean-up backups (photos and data of the contacts that changed), kept for 90 days so they can be undone;</li>
        <li>clean-up choices (such as groups marked "Not duplicates"), which contacts have a photo you uploaded by hand on the Contacts page, and the app's logs.</li>
      </ul>
      <p>The app only connects to:</p>
      <ul>
        <li><strong>Google</strong>, to sign in and to read and update your contacts (People API);</li>
        <li><strong>WhatsApp Web</strong>, to read your contacts' profile photos;</li>
        <li><strong>Telegram</strong>, when you sign in: it reads only your existing Telegram contacts and their photos, and adds nothing to your account;</li>
        <li><strong>Gravatar</strong>, when you turn that source on: it receives the SHA-256 hash of your contacts' email addresses, not the addresses;</li>
        <li><strong>the sites of the profile links</strong> saved on your contacts (for example X, Telegram, YouTube, Bluesky, Mastodon, GitHub and, only if you turn them on, Instagram, Facebook and LinkedIn), when you turn that source on: the app opens the profile's public page, without signing in and without sending any other contact data, to read its picture;</li>
        <li><strong>GitHub</strong>, to check for a new version;</li>
        <li><strong>Google (Chrome for Testing)</strong>, once, to download a browser if none is installed.</li>
      </ul>
      <p>There is no analytics, telemetry or advertising.</p>

      <h2>Web version (self-hosted)</h2>
      <p>
        Whoever runs the server is responsible for the data that passes through it. The software keeps each session in memory (sign-ins, the last
        few syncs) and deletes it when the session expires; it uses one session cookie. Google Analytics only runs if the operator explicitly
        configures it.
      </p>

      <h2>Google user data</h2>
      <p>
        The app reads and updates your Google contacts only for what you start: syncing photos, cleaning up contacts and undoing either. This data
        is not shared, sold or used for advertising.
      </p>
      <p>
        The use and transfer to any other app of information received from Google APIs will adhere to the
        <a :href="userDataPolicy" target="_blank" rel="noopener">Google API Services User Data Policy</a>, including the Limited Use requirements.
      </p>

      <h2>Removing your data</h2>
      <ul>
        <li>In the app: <em>Settings → Data &amp; privacy → Delete all local data</em>, or <em>Sign out</em> of Google and Telegram and <em>Unlink</em> WhatsApp.</li>
        <li>At Google: remove the app's access at <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener">myaccount.google.com/permissions</a>.</li>
        <li>At WhatsApp: <em>Settings → Linked devices</em> on your phone.</li>
      </ul>

      <h2>Changes and contact</h2>
      <p>
        Changes to this policy are published here and in the project's history on GitHub. For questions, open an issue on
        <a :href="issues" target="_blank" rel="noopener">GitHub</a>.
      </p>
    </article>
  </FlowFrame>
</template>
