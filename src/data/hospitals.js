const HOSPITALS = [
  {
    id:'hosp-001', name:'똑똑연세내과의원', addr:'경기도 화성시 향남읍', dept:'내과', type:'의원',
    lat:'37.12540', lng:'126.90910', tel:'', mgrIds:[0,1,4,8,10],
    rating:4.9, reviewCount:182, specialties:['당뇨','고혈압','건강검진'],
    availability:{ openNow:true, sameDay:true, waitMin:15 }
  },
  {
    id:'hosp-002', name:'향남서울내과의원', addr:'경기도 화성시 향남읍', dept:'내과', type:'의원',
    lat:'37.12480', lng:'126.90820', tel:'', mgrIds:[0,2,4,7,9],
    rating:4.8, reviewCount:136, specialties:['당뇨','혈압','소화기'],
    availability:{ openNow:true, sameDay:true, waitMin:25 }
  },
  {
    id:'hosp-003', name:'튼튼정형외과', addr:'경기도 화성시 향남읍', dept:'정형외과', type:'의원',
    lat:'37.12410', lng:'126.90700', tel:'', mgrIds:[2,3,7],
    rating:4.7, reviewCount:94, specialties:['무릎','허리','재활'],
    availability:{ openNow:true, sameDay:false, waitMin:35 }
  },
  {
    id:'hosp-004', name:'향남연세이비인후과', addr:'경기도 화성시 향남읍', dept:'이비인후과', type:'의원',
    lat:'37.12500', lng:'126.90880', tel:'', mgrIds:[1,6,10],
    rating:4.8, reviewCount:107, specialties:['비염','이명','청력'],
    availability:{ openNow:true, sameDay:true, waitMin:20 }
  },
  {
    id:'hosp-005', name:'향남밝은안과의원', addr:'경기도 화성시 향남읍', dept:'안과', type:'의원',
    lat:'37.12350', lng:'126.90680', tel:'', mgrIds:[],
    rating:4.6, reviewCount:78, specialties:['백내장','노안','안구건조'],
    availability:{ openNow:false, sameDay:false, waitMin:null }
  },
  {
    id:'hosp-006', name:'화성시향남보건지소', addr:'경기도 화성시 향남읍', dept:'보건', type:'보건소',
    lat:'37.12320', lng:'126.90780', tel:'', mgrIds:[],
    rating:4.5, reviewCount:41, specialties:['건강검진','예방접종'],
    availability:{ openNow:false, sameDay:false, waitMin:null }
  }
];

const DEPARTMENT_BY_CODE = {
  D001:'내과', D002:'소아', D003:'신경', D004:'정신', D005:'외과',
  D006:'정형외과', D008:'안과', D013:'이비인후과', D014:'피부',
  D015:'비뇨', D016:'산부인과'
};

module.exports = { HOSPITALS, DEPARTMENT_BY_CODE };
