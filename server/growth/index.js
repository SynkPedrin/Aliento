// Composición del módulo de growth. Cada pieza recibe solo lo que necesita.
import { createSettings } from './settings.js';
import { createTracker } from './tracker.js';
import { createStripeHooks } from './stripe-hooks.js';
import { createEmail } from './email.js';
import { createForwarders } from './forwarders.js';
import { createAds } from './ads.js';
import { createAi } from './ai.js';
import { createStaff } from './staff.js';
import { createPeople } from './people.js';
import { createExperiments } from './experiments.js';

export function createGrowth({ db, config, auth = null, fetchImpl = globalThis.fetch, log = console }) {
  const settings = createSettings({ db, config });
  const tracker = createTracker({ db, settings, config, log });
  const hooks = createStripeHooks({ db, tracker, log });
  const email = createEmail({ db, settings, config, fetchImpl, log });
  const forwarders = createForwarders({ db, settings, config, email, fetchImpl, log });
  const ads = createAds({ db, settings, config, fetchImpl, log });
  const experiments = createExperiments({ db, settings, log });
  const staff = createStaff({ db, settings, config, log });
  const people = createPeople({ db, tracker, auth, settings, config, fetchImpl, log });
  const ai = createAi({ db, settings, config, ads, email, experiments, fetchImpl, log });
  return { settings, tracker, hooks, email, forwarders, ads, experiments, staff, people, ai };
}
