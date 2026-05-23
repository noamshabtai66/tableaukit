-- QA pass after Phase 2 mass-seed: unpublish templates whose chart_type was misclassified
-- by the keyword-based categorizer, or where the workbook is a multi-element dashboard
-- without a single clear chart story (chart_type='other').
--
-- Categories:
--   * 'other' (29): multi-chart dashboards lacking single-chart focus
--   * 'kpi' (3): mis-categorized as KPI but actually bar/dashboard
--   * 'map' (1), 'sankey' (1), 'slope' (1), 'column' (1): visual mismatches
--      caught during visual sweep — title contained chart keyword but
--      the workbook renders a different chart type.

update tk_templates
set is_published = false
where slug in (
  -- column: actually an interactive table (row+column highlight)
  'matt-chambers-rowandcolumnhighlighter-rowandcolumnhighlighter',

  -- kpi: actually bars/dashboards
  'ann-jackson-nycurbanparkrangeranimalresponseprogramdataschoolnewyorkjanuary26202',
  'wendy-shijia-annualdisposableincomebysource-dashboard',
  'wendy-shijia-foodconsumptionruralvsurban-dashboard',

  -- map: actually bar/visualization
  'robert-crocker-energymap-16130786906670-energymap',

  -- sankey: actually map+bar
  'merlijn-buit-showmemore-sankeydiagramextension-overview',

  -- slope: actually sparkline strip
  'kevin-flerlage-calculatetheslopeofatrendlineintableau-calculatetheslopeintableau',

  -- other: multi-chart dashboards lacking single-chart focus
  'adam-crahen-babyitscoldoutsidewindchillfrostbite-brrrrrr',
  'adam-crahen-duodare3-ufosightings-dododododo',
  'andy-kriebel-visualvocabulary-visualvocabulary',
  'jeffrey-shaffer-ageofcincinnati-ageofcincinnati',
  'jeffrey-shaffer-highlightentirerowoftable-highlightentirerowoftable',
  'jeffrey-shaffer-theabcsofremovingtheabcs-15969082247980-removingabcs',
  'kasia-gasiewska-holc-garbageintheoceanvotd-garbageintheocean',
  'ken-flerlage-datafamcolors-startpage',
  'ken-flerlage-tableausetcontrolusecases-setcontrol',
  'kevin-flerlage-thetableauchartcatalog-tableauchartexamples',
  'lisa-trescott-howcommonisyourbirthday-17222664505560-birthday',
  'lisa-trescott-relationshipsofseinfeld-relationshipsofseinfeld',
  'marc-reid-southkorea-demographics-southkoreapopulationdensityanddemographics',
  'mark-bradbourne-escaperoom-canyouescape',
  'matt-chambers-2017nationalchampionship-clemsonvsalabama-nationalchampionshipvisu',
  'matt-chambers-linkedintopskills2016-makeovermonday-linkedintopskills2016-makeove',
  'matt-chambers-makeovermonday-facebookscarbonfootprint-revision-facebookscarbonfo',
  'matt-chambers-redvsblue-republicandemocratvoting-redvsbluerepublicananddemocrat',
  'matt-chambers-thehistoryofncaafootball-thehistoryofncaafootball',
  'matt-chambers-themoneyfight-mayweathervsmcgregor-themoneyfightmayweathervsmcgreg',
  'neil-richards-colours-2-100colours',
  'neil-richards-theguardians100greatestuknumberones-top100numberones',
  'sarah-bartlett-europeancitiesonabudget-europeancitiesonabudget',
  'shine-pulikathara-50yearsofcrime-uscrimedashboard',
  'shine-pulikathara-fallhardstandtall-fallhardstandtall',
  'shine-pulikathara-theweeklynews-ironvizchampion-weeklynews',
  'soha-elghany-worlddata-16751035927180-dashboard',
  'yvan-fornes-covidimpactontravel-airpassengergrowthhistory',
  'yvan-fornes-unicefchildrenswell-beingindex-childrenwell-beingbycountries',
  'yvan-fornes-unicefsowc2016-stateoftheworldschildren'
);
