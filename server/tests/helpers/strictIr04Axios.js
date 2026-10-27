// Pure IR-04 transport seam. Never delegates to Axios or a network transport.
function createIr04AxiosMocks(receipt, recordMock) {
  const reject=()=>{receipt.rejectedAxios=(receipt.rejectedAxios||0)+1;throw new Error('Unreviewed IR-04 Axios integration refused');};
  async function get(input){
    let url;try{url=new URL(input);}catch(_){return reject();}
    if(url.username||url.password||url.search||url.hash)return reject();
    if(url.origin==='http://127.0.0.1:5101'&&url.pathname==='/api/internal/health-stats'){
      recordMock('local-health-stats');return{status:200,data:{totalCases:24,activeOutbreaks:2,districtSummary:[{district:'Colombo',cases:14},{district:'Kandy',cases:10}],diseaseTrends:[{disease:'Dengue',count:14},{disease:'Influenza',count:10}]}};
    }
    if(url.origin==='http://ip-api.com'&&/^\/json\/(?:\d{1,3}\.){3}\d{1,3}$/.test(url.pathname)){
      recordMock('ip-geolocation');return{status:200,data:{status:'success',city:'Colombo',country:'Sri Lanka',isp:'Synthetic Test ISP'}};
    }
    return reject();
  }
  async function post(input,body){
    let url;try{url=new URL(input);}catch(_){return reject();}
    if(url.origin!=='http://127.0.0.1:5101'||url.username||url.password||url.search||url.hash)return reject();
    if(!body || Array.isArray(body) || typeof body!=='object')return reject();
    if(url.pathname==='/patient-risk'){
      if(Object.keys(body).some(key=>!['age','chronicConditions','consultationCount30days','activePrescriptionsCount'].includes(key)) ||
        !Number.isFinite(body.age) || !Array.isArray(body.chronicConditions) || body.chronicConditions.some(value=>typeof value!=='string') ||
        !Number.isSafeInteger(body.consultationCount30days) || body.consultationCount30days<0 || !Number.isSafeInteger(body.activePrescriptionsCount) || body.activePrescriptionsCount<0)return reject();
      recordMock('local-patient-risk');return{status:200,data:{riskLevel:'low',riskScore:0.15}};
    }
    if(url.pathname==='/ingest'){
      if(Object.keys(body).some(key=>!['district','drugCategory','date'].includes(key)) || (body.district!==undefined&&typeof body.district!=='string') ||
        typeof body.drugCategory!=='string' || !body.drugCategory.trim() || typeof body.date!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.date) ||
        !Number.isFinite(Date.parse(body.date)) || new Date(body.date).toISOString().slice(0,10)!==body.date)return reject();
      recordMock('local-ingest');return{status:200,data:{ingested:true}};
    }
    return reject();
  }
  return {get,post,reject};
}
module.exports={createIr04AxiosMocks};
