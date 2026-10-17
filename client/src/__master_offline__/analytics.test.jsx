jest.mock('react',()=>({useEffect:action=>action()}));
jest.mock('react-router-dom',()=>({useLocation:()=>({pathname:'/synthetic',search:'?synthetic=1'})}));
jest.mock('react-ga4',()=>({initialize:jest.fn(),send:jest.fn()}));
test('Explicit QA mode prevents analytics initialization and page tracking even with an ID',()=>{
  process.env.REACT_APP_MEDISYNC_QA='true';process.env.REACT_APP_GA_MEASUREMENT_ID='INERT_NON_SECRET_MARKER';
  const ga=require('react-ga4'),analytics=require('../utils/analytics');analytics.initGA();analytics.usePageTracking();
  expect(ga.initialize).not.toHaveBeenCalled();expect(ga.send).not.toHaveBeenCalled();
  delete process.env.REACT_APP_MEDISYNC_QA;delete process.env.REACT_APP_GA_MEASUREMENT_ID;
});
