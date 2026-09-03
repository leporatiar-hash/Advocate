"""Bundled medication name list for autocomplete.

Why a bundled list at all, when RxNav exists: the caregiver typing this is
often doing it once, at onboarding, on a phone, possibly offline, and a
medication name they can't spell is exactly the case where an empty dropdown is
worst. This list answers instantly and always. RxNav then widens coverage and
handles misspellings when the network cooperates — see routers/medications.py.

Scope is deliberately "what caregivers on this app actually log": psychiatric,
neurological, dementia, pain, and the common general-medicine drugs that show up
alongside them. It is NOT a formulary and does not need to be — anything missing
falls through to RxNav, and failing that, free text still works.

Each entry is "Generic (Brand)" where the brand is the one people actually say.
Matching is done on the whole string, so typing either half finds it.
"""

COMMON_MEDICATIONS: list[str] = [
    # ── Antidepressants — SSRI ────────────────────────────────────────────────
    "Sertraline (Zoloft)", "Fluoxetine (Prozac)", "Escitalopram (Lexapro)",
    "Citalopram (Celexa)", "Paroxetine (Paxil)", "Fluvoxamine (Luvox)",
    # ── Antidepressants — SNRI / atypical ─────────────────────────────────────
    "Venlafaxine (Effexor)", "Desvenlafaxine (Pristiq)", "Duloxetine (Cymbalta)",
    "Bupropion (Wellbutrin)", "Mirtazapine (Remeron)", "Trazodone (Desyrel)",
    "Vilazodone (Viibryd)", "Vortioxetine (Trintellix)", "Nefazodone",
    # ── Antidepressants — tricyclic / MAOI ────────────────────────────────────
    "Amitriptyline (Elavil)", "Nortriptyline (Pamelor)", "Doxepin (Silenor)",
    "Imipramine (Tofranil)", "Clomipramine (Anafranil)", "Phenelzine (Nardil)",
    "Tranylcypromine (Parnate)", "Selegiline (Emsam)",
    # ── Antipsychotics — second generation ────────────────────────────────────
    "Aripiprazole (Abilify)", "Risperidone (Risperdal)", "Olanzapine (Zyprexa)",
    "Quetiapine (Seroquel)", "Ziprasidone (Geodon)", "Paliperidone (Invega)",
    "Lurasidone (Latuda)", "Asenapine (Saphris)", "Brexpiprazole (Rexulti)",
    "Cariprazine (Vraylar)", "Clozapine (Clozaril)", "Iloperidone (Fanapt)",
    "Pimavanserin (Nuplazid)", "Olanzapine/Samidorphan (Lybalvi)",
    # ── Antipsychotics — first generation ─────────────────────────────────────
    "Haloperidol (Haldol)", "Chlorpromazine (Thorazine)", "Fluphenazine (Prolixin)",
    "Perphenazine (Trilafon)", "Thiothixene (Navane)", "Trifluoperazine (Stelazine)",
    "Loxapine (Loxitane)",
    # ── Long-acting injectables ───────────────────────────────────────────────
    "Aripiprazole LAI (Abilify Maintena)", "Paliperidone LAI (Invega Sustenna)",
    "Risperidone LAI (Consta)", "Haloperidol decanoate",
    # ── Mood stabilisers / anticonvulsants ────────────────────────────────────
    "Lithium carbonate (Lithobid)", "Lamotrigine (Lamictal)",
    "Valproate / Divalproex (Depakote)", "Carbamazepine (Tegretol)",
    "Oxcarbazepine (Trileptal)", "Topiramate (Topamax)", "Levetiracetam (Keppra)",
    "Gabapentin (Neurontin)", "Pregabalin (Lyrica)", "Phenytoin (Dilantin)",
    "Lacosamide (Vimpat)", "Zonisamide (Zonegran)", "Clobazam (Onfi)",
    "Phenobarbital", "Ethosuximide (Zarontin)",
    # ── Anxiolytics / sedatives ───────────────────────────────────────────────
    "Lorazepam (Ativan)", "Clonazepam (Klonopin)", "Alprazolam (Xanax)",
    "Diazepam (Valium)", "Buspirone (Buspar)", "Hydroxyzine (Vistaril)",
    "Temazepam (Restoril)", "Zolpidem (Ambien)", "Eszopiclone (Lunesta)",
    "Melatonin", "Ramelteon (Rozerem)", "Suvorexant (Belsomra)",
    # ── ADHD / stimulants ─────────────────────────────────────────────────────
    "Methylphenidate (Ritalin)", "Methylphenidate ER (Concerta)",
    "Dexmethylphenidate (Focalin)", "Amphetamine salts (Adderall)",
    "Lisdexamfetamine (Vyvanse)", "Dextroamphetamine (Dexedrine)",
    "Atomoxetine (Strattera)", "Guanfacine (Intuniv)", "Clonidine (Kapvay)",
    "Viloxazine (Qelbree)",
    # ── Dementia / cognition ──────────────────────────────────────────────────
    "Donepezil (Aricept)", "Memantine (Namenda)", "Rivastigmine (Exelon)",
    "Galantamine (Razadyne)", "Lecanemab (Leqembi)", "Donanemab (Kisunla)",
    # ── Parkinson's / movement ────────────────────────────────────────────────
    "Carbidopa/Levodopa (Sinemet)", "Pramipexole (Mirapex)", "Ropinirole (Requip)",
    "Rasagiline (Azilect)", "Amantadine (Gocovri)", "Entacapone (Comtan)",
    "Benztropine (Cogentin)", "Trihexyphenidyl (Artane)", "Safinamide (Xadago)",
    "Valbenazine (Ingrezza)", "Deutetrabenazine (Austedo)",
    # ── Multiple sclerosis ────────────────────────────────────────────────────
    "Ocrelizumab (Ocrevus)", "Natalizumab (Tysabri)", "Dimethyl fumarate (Tecfidera)",
    "Fingolimod (Gilenya)", "Glatiramer acetate (Copaxone)", "Teriflunomide (Aubagio)",
    "Interferon beta-1a (Avonex)", "Baclofen (Lioresal)", "Tizanidine (Zanaflex)",
    # ── Opioid / alcohol use disorder ─────────────────────────────────────────
    "Buprenorphine/Naloxone (Suboxone)", "Buprenorphine (Sublocade)",
    "Naltrexone (Vivitrol)", "Methadone", "Acamprosate (Campral)",
    "Disulfiram (Antabuse)", "Naloxone (Narcan)",
    # ── Pain / anti-inflammatory ──────────────────────────────────────────────
    "Acetaminophen (Tylenol)", "Ibuprofen (Advil)", "Naproxen (Aleve)",
    "Celecoxib (Celebrex)", "Meloxicam (Mobic)", "Diclofenac (Voltaren)",
    "Tramadol (Ultram)", "Oxycodone (OxyContin)", "Hydrocodone/APAP (Norco)",
    "Morphine (MS Contin)", "Fentanyl patch (Duragesic)", "Prednisone",
    "Duloxetine for pain (Cymbalta)", "Cyclobenzaprine (Flexeril)",
    # ── Cardiovascular / metabolic ────────────────────────────────────────────
    "Lisinopril (Zestril)", "Losartan (Cozaar)", "Amlodipine (Norvasc)",
    "Metoprolol (Lopressor)", "Atenolol (Tenormin)", "Propranolol (Inderal)",
    "Carvedilol (Coreg)", "Hydrochlorothiazide (Microzide)", "Furosemide (Lasix)",
    "Atorvastatin (Lipitor)", "Rosuvastatin (Crestor)", "Simvastatin (Zocor)",
    "Clopidogrel (Plavix)", "Apixaban (Eliquis)", "Rivaroxaban (Xarelto)",
    "Warfarin (Coumadin)", "Aspirin",
    "Metformin (Glucophage)", "Insulin glargine (Lantus)", "Semaglutide (Ozempic)",
    "Empagliflozin (Jardiance)", "Levothyroxine (Synthroid)",
    # ── GI / respiratory / other common ───────────────────────────────────────
    "Omeprazole (Prilosec)", "Pantoprazole (Protonix)", "Famotidine (Pepcid)",
    "Ondansetron (Zofran)", "Docusate (Colace)", "Polyethylene glycol (Miralax)",
    "Albuterol (ProAir)", "Fluticasone (Flovent)", "Montelukast (Singulair)",
    "Cetirizine (Zyrtec)", "Loratadine (Claritin)", "Diphenhydramine (Benadryl)",
    "Vitamin D", "Vitamin B12", "Folic acid", "Ferrous sulfate (Iron)",
    "Calcium carbonate", "Magnesium oxide", "Omega-3 fish oil", "Multivitamin",
]
