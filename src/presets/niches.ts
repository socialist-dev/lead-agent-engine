export interface NichePreset {
  name: string;
  dorks: string[];
  systemRole: string;
  validationRules: string;
  categoryTags: string[];
  extraField1Label: string;
  extraField2Label: string;
}

export const NICHE_PRESETS: Record<string, NichePreset> = {
  // 1. Bất động sản Hà Nội
  'bds_hanoi': {
    name: 'Bất Động Sản Hà Nội',
    dorks: [
      '("cần mua chung cư" OR "tìm mua căn hộ" OR "hỏi mua nhà") ("hà nội" OR "nam từ liêm" OR "cầu giấy" OR "hà đông" OR "hoàng mai") -"bán đất" -"môi giới"',
      'site:threads.net ("cần tìm căn 2pn" OR "mua chung cư tài chính 3 tỷ" OR "ai bán nhà hà nội") -"bán gấp"',
      'site:facebook.com/groups ("cần mua căn hộ" OR "tìm nhà chính chủ" OR "tài chính 2 tỷ cần mua nhà") -"môi giới"'
    ],
    systemRole: 'Bạn là chuyên gia thẩm định nhu cầu Mua/Thuê Bất Động Sản tại Hà Nội.',
    validationRules: '- DUYỆT: Người cần mua/thuê nhà thật. LOẠI BỎ: Môi giới/cò đăng tin bán.',
    categoryTags: ['[Cần Mua 1-2PN]', '[Cần Mua 3PN+]', '[Tài Chính 2-3 Tỷ]', '[Tài Chính > 4 Tỷ]', '[Thuê Nhà]'],
    extraField1Label: 'Ngân sách & Khu vực',
    extraField2Label: 'SĐT / Liên hệ'
  },

  // 2. Thiết kế & Thi công Nội thất TP.HCM
  'noi_that_hcm': {
    name: 'Nội Thất & Xây Dựng HCM',
    dorks: [
      '("cần tìm đội thi công" OR "tìm xưởng mộc" OR "cần làm tủ bếp" OR "tìm người thiết kế nội thất") ("hcm" OR "sài gòn" OR "thủ đức" OR "quận 7")',
      'site:threads.net ("tìm bên làm nội thất" OR "sửa nhà trọn gói" OR "thiết kế căn hộ")',
      'site:facebook.com/groups ("cần làm nội thất chung cư" OR "tìm thợ mộc" OR "báo giá thi công nội thất")'
    ],
    systemRole: 'Bạn là chuyên gia thẩm định nhu cầu Thiết kế & Thi công Nội thất.',
    validationRules: '- DUYỆT: Chủ nhà cần tìm xưởng/đội thi công. LOẠI BỎ: Xưởng tự quảng cáo.',
    categoryTags: ['[Làm Tủ Bếp]', '[Nội Thất Căn Hộ]', '[Sửa Nhà Trọn Gói]', '[Thiết Kế 3D]'],
    extraField1Label: 'Hạng mục thi công',
    extraField2Label: 'SĐT / Liên hệ chủ nhà'
  },

  // 3. Tuyển Video Editor & Design
  'freelance_video': {
    name: 'Video Editor & Graphic Design',
    dorks: [
      '("ai edit được" OR "ai làm được video" OR "cần tìm editor" OR "tuyển freelance video") ("kiểu này" OR "như này" OR "inbox")',
      'site:threads.net ("ai nhận edit" OR "ai làm được video" OR "cần người làm clip")',
      'site:facebook.com/groups ("hổng biết có ai" OR "ai nhận làm" OR "cần editor gấp") ("như này" OR "kiểu này")'
    ],
    systemRole: 'Bạn là chuyên gia thẩm định Job Video Editing & Design.',
    validationRules: '- DUYỆT: Khách cần thuê làm video/ảnh. LOẠI BỎ: Dịch vụ ngoài đời (làm tóc, makeup) và freelancer chào dịch vụ.',
    categoryTags: ['[Edit Theo Mẫu / TikTok]', '[CapCut / Reels]', '[Premiere / AE]', '[Thumbnail / Banner]'],
    extraField1Label: 'Ngân sách / Yêu cầu',
    extraField2Label: 'Liên hệ người thuê'
  },

  // 4. Vẽ 2D & Art Commission
  'art_commission': {
    name: '2D Art & Drawing Commission',
    dorks: [
      '("hổng biết có ai" OR "có ai nhận vẽ" OR "ai vẽ được" OR "bác nào nhận vẽ") ("kiểu này" OR "style này" OR "như này")',
      '("cần tìm artist" OR "cần vẽ commission" OR "cần thuê vẽ oc" OR "tìm người vẽ bìa")',
      'site:threads.net ("cần vẽ comm" OR "tìm artist" OR "ai nhận vẽ" OR "cần vẽ oc")'
    ],
    systemRole: 'Bạn là chuyên gia thẩm định nhu cầu Đặt Vẽ Tranh 2D & Commission.',
    validationRules: '- DUYỆT: Khách cần thuê vẽ tranh 2D. LOẠI BỎ: Artist tự chào mở slot comm.',
    categoryTags: ['[Chibi / Avatar]', '[Character / OC]', '[Minh Họa / Bìa]', '[Webtoon / Comic]'],
    extraField1Label: 'Ngân sách vẽ',
    extraField2Label: 'Liên hệ người đặt'
  },

  // 5. Nhu cầu tìm Tool quét Data & Tìm Lead của Sale
  'sales_tools': {
    name: 'Nhu Cầu Tool Quét Data của Sale',
    dorks: [
      '("có tool nào" OR "xin tool" OR "phần mềm nào") ("quét data" OR "cào data" OR "lấy số điện thoại" OR "quét sđt")',
      'site:threads.net ("tool quét data" OR "kiếm data sale" OR "lấy data khách hàng" OR "cào sđt")',
      'site:facebook.com/groups ("có tool nào quét" OR "xin phần mềm quét data" OR "cách cào data")'
    ],
    systemRole: 'Bạn là chuyên gia phân tích nhu cầu phần mềm cào Data của Sales.',
    validationRules: '- DUYỆT: Sale/Doanh chủ hỏi xin tool, than phiền thiếu data. LOẠI BỎ: Người bán data rác.',
    categoryTags: ['[Cần Tool SĐT/Email]', '[Cần Tool Google Maps]', '[Cần Tool Facebook Group]', '[Hỏi Giải Pháp Data]'],
    extraField1Label: 'Lĩnh vực & Nỗi đau',
    extraField2Label: 'Mức độ sẵn sàng trả phí / Liên hệ'
  }
};
