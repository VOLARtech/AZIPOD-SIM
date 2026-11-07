// Citations for the training guide. A claim names its sources by id; the Reference list and
// docs/TRAINING.md print them from here. Add a source only after reading it (the dossier says when).
import type { Source } from './types';

export const SOURCES: Source[] = [
  // ---- Azipod ships
  {
    id: 'nowicki-2014', kind: 'paper',
    cite: 'Nowicki, J. (2014), Stopping of Ships Equipped with Azipods, TransNav 8(3), doi:10.12716/1001.08.03.07',
    url: 'https://www.transnav.eu/files/Stopping_of_Ships_Equipped_with_Azipods,519.pdf',
  },
  {
    id: 'striga-impa', kind: 'guidance',
    cite: 'Striga, R., AZIPODS memento for the pilots’ use, IMPA (builders’ data and the experience of Capt. P. Esposito, 2002)',
    url: 'https://www.impahq.org/sites/default/files/2021-04/article1198153097_0.pdf',
  },
  {
    id: 'abb-azipod-co', kind: 'manual',
    cite: 'ABB, Azipod® CO product introduction',
    url: 'https://library.e.abb.com/public/85d7a5e53e6a8e6ec12577e7002d2359/Azipod_CO_Product%20Introduction_rev%20C_LowRes.pdf',
  },
  {
    id: 'azipilot-2011', kind: 'guidance',
    cite: 'AZIPILOT project (2011), Deliverable 3.10: Intuitive operation and pilot training when using marine azimuthing control devices',
    url: 'https://ancientportsantiques.com/wp-content/uploads/Documents/AUTHORS/AdG/AZIPILOT%20-Training2011.pdf',
  },

  // ---- Berthing
  {
    id: 'brolsma-1977', kind: 'paper',
    cite: 'Brolsma, J.U., Hirs, J.G. and Langeveld, J.M. (1977), On fender design and berthing velocities, PIANC International Navigation Congress, Section II, Subject 4, pp. 87–100',
  },
  { id: 'pianc-wg33', kind: 'standard', cite: 'PIANC (2002), Guidelines for the design of fender systems: 2002, Report of Working Group 33' },
  {
    id: 'pianc-wg211', kind: 'paper',
    cite: 'Recommendations for Berthing Velocity in PIANC WG 211, ASCE',
    url: 'https://ascelibrary.com/doi/10.1061/9780784484395.054',
  },
  {
    id: 'ishihata-1988', kind: 'paper',
    cite: 'Ishihata, S. (1988), Actual berthing speed of VLCC and its optimum speed, Institute of Navigation Journal (Japan) 79, p. 177 (abstract read; the paper is in Japanese)',
    url: 'https://trid.trb.org/View/432962',
  },

  // ---- Tugs
  {
    id: 'ral-escort', kind: 'guidance',
    cite: 'Robert Allan Ltd (2025), Escort Towage',
    url: 'https://ral.ca/wp-content/uploads/2025/06/Escort-Towage.pdf',
  },
  {
    id: 'artyszuk-2014', kind: 'paper',
    cite: 'Artyszuk, J. (2014), Steady-state manoeuvring of a generic ASD tug in escort pull and bow-rope aided push operation, TransNav 8(3), doi:10.12716/1001.08.03.17',
    url: 'https://www.transnav.eu/files/Steadystate_Manoeuvring_of_a_Generic_ASD_Tug_in_Escort_Pull_and_Bowrope_Aided_Push_Operation,529.pdf',
  },
  {
    id: 'ishikura-2013', kind: 'paper',
    cite: 'Ishikura, A., Sugita, K., Hayashi, Y. and Murai, K. (2013), Proposal for global standard manoeuvring orders for tugboats, TransNav 7(4), doi:10.12716/1001.07.04.05',
    url: 'https://www.transnav.eu/files/Proposal_for_Global_Standard_Maneuvering_Orders_for_Tugboats,462.pdf',
  },
  {
    id: 'flinders-tug-orders', kind: 'guidance',
    cite: 'Flinders Ports Holdings, Tug orders',
    url: 'https://www.flindersportholdings.com.au/wp-content/uploads/2025/09/Tug-Orders.pdf',
  },
  {
    id: 'mhpa-towage-2021', kind: 'guidance',
    cite: 'Milford Haven Port Authority (2021), Towage guidelines',
    url: 'https://www.mhpa.co.uk/media/gavmxl2p/towage-guidelines-2021.pdf',
  },
  {
    id: 'maib-ijsselstroom', kind: 'incident',
    cite: 'MAIB, Girting and capsize of tug IJsselstroom in Peterhead Bay, Scotland (accident report)',
    url: 'https://www.gov.uk/maib-reports/girting-and-capsize-of-tug-ijsselstroom-in-peterhead-bay-scotland',
  },
  {
    id: 'mgn468-annex2', kind: 'standard',
    cite: 'MCA, MGN 468 (M) Amendment 1, Voluntary Towage Endorsement Scheme, Annex 2: competence standards for ship-assist towage endorsement',
    url: 'https://gov.uk/government/publications/mgn-468-amendment-1-m-voluntary-towage-endorsement-scheme/annex-2-competence-standards-for-ship-assist-towage-endorsement',
  },
  {
    id: 'jurgens-voith', kind: 'paper',
    cite: 'Jürgens, D. and Palm, M., Voith Water Tractor: improved manoeuvrability and seakeeping behaviour',
    url: 'https://towmasters.wordpress.com/wp-content/uploads/2009/06/voithwatertractor.pdf',
  },

  // ---- Specialised propulsion
  {
    id: 'hamiltonjet-hj', kind: 'manual',
    cite: 'HamiltonJet (2014), HJ Series waterjets brochure',
    url: 'https://hamiltonjet.com/assets/main/hj-series-brochure-eng-2014.pdf',
  },
  {
    id: 'man-reversing', kind: 'web',
    cite: 'MAN B&W two-stroke reversing (marinediesels.info)',
    url: 'https://www.marinediesels.info/2_stroke_engine_parts/Other_info/MANB&W_reversing.htm',
  },
  {
    id: 'marinesite-crash', kind: 'web',
    cite: 'Crash manoeuvring, crash stop of the main engine (marinesite.info)',
    url: 'https://www.marinesite.info/2019/07/crash-manouvering-crash-stop-main-engine.html',
  },

  // ---- Standards
  {
    id: 'imo-a601', kind: 'standard',
    cite: 'IMO Resolution A.601(15), Provision and display of manoeuvring information on board ships',
    url: 'https://wwwcdn.imo.org/localresources/en/KnowledgeCentre/IndexofIMOResolutions/AssemblyDocuments/A.601(15).pdf',
  },
  {
    id: 'imo-msc137', kind: 'standard',
    cite: 'IMO MSC.137(76), Standards for ship manoeuvrability, as summarised in the ABS Guide for Vessel Maneuverability',
    url: 'https://ww2.eagle.org/content/dam/eagle/rules-and-guides/current/conventional_ocean_service/145_vesselmaneuverability/Vessel_Maneuverability_Guide_e-Feb17.pdf',
  },
];

export const SRC: Record<string, Source> = Object.fromEntries(SOURCES.map(s => [s.id, s]));
