const HOSPITALS = [
  { name:'똑똑연세내과의원', addr:'경기도 화성시 향남읍', dept:'내과', type:'의원', lat:'37.12540', lng:'126.90910', tel:'', mgrIds:[0,1,4,8,10] },
  { name:'향남서울내과의원', addr:'경기도 화성시 향남읍', dept:'내과', type:'의원', lat:'37.12480', lng:'126.90820', tel:'', mgrIds:[0,2,4,7,9] },
  { name:'튼튼정형외과', addr:'경기도 화성시 향남읍', dept:'정형외과', type:'의원', lat:'37.12410', lng:'126.90700', tel:'', mgrIds:[2,3,7] },
  { name:'향남연세이비인후과', addr:'경기도 화성시 향남읍', dept:'이비인후과', type:'의원', lat:'37.12500', lng:'126.90880', tel:'', mgrIds:[1,6,10] },
  { name:'향남밝은안과의원', addr:'경기도 화성시 향남읍', dept:'안과', type:'의원', lat:'37.12350', lng:'126.90680', tel:'', mgrIds:[] },
  { name:'화성시향남보건지소', addr:'경기도 화성시 향남읍', dept:'보건', type:'보건소', lat:'37.12320', lng:'126.90780', tel:'', mgrIds:[] }
];

const DEPARTMENT_BY_CODE = {
  D001:'내과', D002:'소아', D003:'신경', D004:'정신', D005:'외과',
  D006:'정형외과', D008:'안과', D013:'이비인후과', D014:'피부',
  D015:'비뇨', D016:'산부인과'
};

module.exports = { HOSPITALS, DEPARTMENT_BY_CODE };
