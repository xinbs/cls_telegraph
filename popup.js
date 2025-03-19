// 弹出页面脚本
document.addEventListener('DOMContentLoaded', () => {
  // 获取DOM元素
  const telegraphList = document.getElementById('telegraphList');
  const lastUpdateTime = document.getElementById('lastUpdateTime');
  const refreshBtn = document.getElementById('refreshBtn');
  const emptyState = document.getElementById('emptyState');
  const emptyRefreshBtn = document.getElementById('emptyRefreshBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsPanel = document.getElementById('settingsPanel');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
  const notificationsEnabled = document.getElementById('notificationsEnabled');
  const darkModeEnabled = document.getElementById('darkModeEnabled');
  const hotThreshold = document.getElementById('hotThreshold');
  const hotThresholdValue = document.getElementById('hotThresholdValue');
  const searchInput = document.getElementById('searchInput');
  const filterButtons = document.querySelectorAll('.filter-btn');
  const badgeTypeSelect = document.getElementById('badgeTypeSelect');
  const cacheHours = document.getElementById('cacheHours');
  
  // 消息计数元素
  const totalCount = document.getElementById('totalCount');
  const unreadCount = document.getElementById('unreadCount');
  const importantCount = document.getElementById('importantCount');
  const hotCount = document.getElementById('hotCount');
  
  // 当前过滤器状态
  let currentFilter = 'unread'; // 默认显示未读消息
  let searchQuery = '';
  
  // 初始化
  init();
  
  // 事件监听器
  refreshBtn.addEventListener('click', refreshData);
  emptyRefreshBtn.addEventListener('click', refreshData);
  settingsBtn.addEventListener('click', toggleSettingsPanel);
  saveSettingsBtn.addEventListener('click', saveSettings);
  cancelSettingsBtn.addEventListener('click', toggleSettingsPanel);
  
  // 添加GitHub仓库链接点击事件
  const githubLink = document.getElementById('githubLink');
  if (githubLink) {
    githubLink.addEventListener('click', (e) => {
      e.preventDefault();
      // 使用chrome.tabs.create打开GitHub仓库链接
      chrome.tabs.create({ url: 'https://github.com/xinbs/cls_telegraph' });
    });
  }
  
  // 添加"已读"按钮的点击事件，将所有消息标记为已读
  const markAllReadBtn = document.getElementById('markAllReadBtn');
  if (markAllReadBtn) {
    markAllReadBtn.addEventListener('click', () => {
      markAllAsRead();
    });
  }
  
  darkModeEnabled.addEventListener('change', () => {
    document.body.classList.toggle('dark-mode', darkModeEnabled.checked);
  });
  
  hotThreshold.addEventListener('input', () => {
    hotThresholdValue.textContent = hotThreshold.value;
  });
  
  badgeTypeSelect.addEventListener('change', async () => {
    const settings = await chrome.storage.local.get('settings');
    settings.settings.badgeType = badgeTypeSelect.value;
    await chrome.storage.local.set({ settings });
    updateBadgeCount();
  });
  
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim().toLowerCase();
    renderTelegraphList();
  });
  
  filterButtons.forEach(button => {
    button.addEventListener('click', () => {
      filterButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      currentFilter = button.dataset.filter;
      renderTelegraphList();
    });
  });
  
  // 初始化函数
  async function init() {
    // 加载设置
    const { settings = {
      notificationsEnabled: true,
      darkMode: false,
      hotThreshold: 10000,
      badgeType: 'unread',  // 默认显示未读消息数
      cacheHours: 24
    } } = await chrome.storage.local.get('settings');

    // 设置界面初始值
    notificationsEnabled.checked = settings.notificationsEnabled;
    darkModeEnabled.checked = settings.darkMode;
    hotThreshold.value = settings.hotThreshold || 10000;
    hotThresholdValue.textContent = settings.hotThreshold || 10000;
    badgeTypeSelect.value = settings.badgeType || 'unread';
    cacheHours.value = settings.cacheHours || 24;
    
    // 应用深色模式
    document.body.classList.toggle('dark-mode', settings.darkMode);
    
    // 移除所有按钮的高亮
    filterButtons.forEach(btn => btn.classList.remove('active'));
    // 设置默认过滤器为未读
    const unreadButton = document.querySelector('[data-filter="unread"]');
    if (unreadButton) {
      unreadButton.classList.add('active');
      currentFilter = 'unread';
    }
    
    // 加载电报数据
    loadTelegraphData();
  }
  
  // 更新消息计数
  async function updateMessageCounts(telegraphs) {
    if (!telegraphs || !Array.isArray(telegraphs)) {
      console.log('没有电报数据或数据格式不正确');
      return {
        total: 0,
        unread: 0,
        important: 0,
        hot: 0
      };
    }
    
    // 获取设置
    const { settings = { cacheHours: 24, hotThreshold: 10000 } } = 
      await chrome.storage.local.get('settings');
    
    // 过滤出缓存时间内的电报
    const now = new Date();
    const cutoffTime = new Date(now - settings.cacheHours * 60 * 60 * 1000);
    
    const validTelegraphs = telegraphs.filter(telegraph => {
      const telegraphTime = new Date(telegraph.timestamp);
      return telegraphTime >= cutoffTime;
    });
    
    console.log(`计数：总共${telegraphs.length}条电报，有效期内${validTelegraphs.length}条`);
    
    // 计算各类消息数量
    const counts = {
      total: validTelegraphs.length,
      unread: validTelegraphs.filter(t => !t.read).length,
      important: validTelegraphs.filter(t => t.isImportant).length,
      hot: validTelegraphs.filter(t => t.readCount >= settings.hotThreshold).length
    };
    
    console.log('计算得到的计数:', counts);
    
    // 更新显示
    if (totalCount) totalCount.textContent = counts.total;
    if (unreadCount) unreadCount.textContent = counts.unread;
    if (importantCount) importantCount.textContent = counts.important;
    if (hotCount) hotCount.textContent = counts.hot;
    
    // 更新扩展图标上的徽章
    await updateBadgeCount(counts);
    
    return counts;
  }
  
  // 更新扩展图标徽章
  async function updateBadgeCount(counts) {
    const { settings } = await chrome.storage.local.get('settings');
    const badgeType = settings?.badgeType || 'unread';
    
    let count = 0;
    switch (badgeType) {
      case 'total':
        count = counts.total;
        break;
      case 'unread':
        count = counts.unread;
        break;
      case 'important':
        count = counts.important;
        break;
      case 'hot':
        count = counts.hot;
        break;
    }
    
    // 更新徽章
    chrome.action.setBadgeText({ text: count.toString() });
    chrome.action.setBadgeBackgroundColor({ color: getBadgeColor(badgeType) });
  }
  
  // 获取徽章颜色
  function getBadgeColor(type) {
    switch (type) {
      case 'important':
        return '#de0422';
      case 'hot':
        return '#ff5722';
      case 'unread':
        return '#1e88e5';
      default:
        return '#666666';
    }
  }
  
  // 加载电报数据
  async function loadTelegraphData() {
    try {
      console.log('开始加载电报数据...');
      const { telegraphs, lastUpdate } = await chrome.storage.local.get(['telegraphs', 'lastUpdate']);
      
      console.log(`从存储中获取到${telegraphs ? telegraphs.length : 0}条电报`);
      
      // 更新最后更新时间
      if (lastUpdate) {
        const date = new Date(lastUpdate);
        lastUpdateTime.textContent = formatDateTime(date);
        console.log(`最后更新时间: ${formatDateTime(date)}`);
      } else {
        lastUpdateTime.textContent = '从未更新';
        console.log('从未更新电报数据');
      }
      
      // 渲染电报列表
      if (telegraphs && telegraphs.length > 0) {
        console.log(`准备渲染${telegraphs.length}条电报...`);
        renderTelegraphList(telegraphs);
      } else {
        console.log('没有电报数据，显示空状态');
        showEmptyState();
      }
    } catch (error) {
      console.error('加载电报数据失败:', error);
      showEmptyState();
    }
  }
  
  // 渲染电报列表
  async function renderTelegraphList() {
    console.log('开始渲染电报列表...');
    const { telegraphs, settings = { cacheHours: 24, hotThreshold: 10000 } } = 
      await chrome.storage.local.get(['telegraphs', 'settings']);
    
    console.log(`从存储中获取到${telegraphs ? telegraphs.length : 0}条电报用于渲染`);
    
    if (!telegraphs || telegraphs.length === 0) {
      console.log('没有电报数据，显示空状态');
      showEmptyState();
      return;
    }
    
    // 过滤电报
    let filteredTelegraphs = [...telegraphs];
    
    // 只显示缓存时间内的电报
    const now = new Date();
    const cutoffTime = new Date(now - settings.cacheHours * 60 * 60 * 1000);
    
    console.log('过滤时间范围:', {
      now: now.toISOString(),
      cutoffTime: cutoffTime.toISOString(),
      cacheHours: settings.cacheHours
    });
    
    filteredTelegraphs = filteredTelegraphs.filter(telegraph => {
      const telegraphTime = new Date(telegraph.timestamp);
      const isValid = telegraphTime >= cutoffTime;
      if (!isValid) {
        console.log('过滤掉电报:', {
          id: telegraph.id,
          time: telegraph.timestamp,
          title: telegraph.title
        });
      }
      return isValid;
    });
    
    console.log(`缓存时间过滤后剩余${filteredTelegraphs.length}条电报`);
    
    // 确保重要内容标记正确
    filteredTelegraphs.forEach(telegraph => {
      if ((telegraph.title && telegraph.title.includes('c-de0422')) || 
          (telegraph.content && telegraph.content.includes('c-de0422'))) {
        telegraph.isImportant = true;
      }
    });
    
    // 更新消息计数
    const counts = {
      total: filteredTelegraphs.length,
      unread: filteredTelegraphs.filter(t => !t.read).length,
      important: filteredTelegraphs.filter(t => t.isImportant).length,
      hot: filteredTelegraphs.filter(t => t.readCount >= settings.hotThreshold).length
    };
    
    // 更新显示
    if (totalCount) totalCount.textContent = counts.total;
    if (unreadCount) unreadCount.textContent = counts.unread;
    if (importantCount) importantCount.textContent = counts.important;
    if (hotCount) hotCount.textContent = counts.hot;
    
    // 更新徽章
    await updateBadgeCount(counts);
    
    // 应用过滤器
    if (currentFilter === 'unread') {
      filteredTelegraphs = filteredTelegraphs.filter(item => !item.read);
      console.log(`过滤后剩余${filteredTelegraphs.length}条未读电报`);
    } else if (currentFilter === 'hot') {
      filteredTelegraphs = filteredTelegraphs.filter(item => item.readCount >= settings.hotThreshold);
      console.log(`过滤后剩余${filteredTelegraphs.length}条热门电报`);
    } else if (currentFilter === 'important') {
      filteredTelegraphs = filteredTelegraphs.filter(item => item.isImportant);
      console.log(`过滤后剩余${filteredTelegraphs.length}条重要电报`);
    }
    
    // 应用搜索
    if (searchQuery) {
      filteredTelegraphs = filteredTelegraphs.filter(item => 
        (item.title && item.title.toLowerCase().includes(searchQuery)) || 
        (item.content && item.content.toLowerCase().includes(searchQuery))
      );
      console.log(`搜索"${searchQuery}"后剩余${filteredTelegraphs.length}条电报`);
    }
    
    // 清空列表
    telegraphList.innerHTML = '';
    
    if (filteredTelegraphs.length === 0) {
      console.log('过滤后没有匹配的电报');
      const noResultsDiv = document.createElement('div');
      noResultsDiv.className = 'loading';
      noResultsDiv.textContent = '没有匹配的电报';
      telegraphList.appendChild(noResultsDiv);
      return;
    }
    
    // 创建电报项目
    console.log(`开始创建${filteredTelegraphs.length}个电报项目...`);
    filteredTelegraphs.forEach((telegraph, index) => {
      try {
        const telegraphItem = createTelegraphItem(telegraph);
        telegraphList.appendChild(telegraphItem);
      } catch (error) {
        console.error(`创建电报项目失败:`, error, telegraph);
      }
    });
    
    // 隐藏空状态
    emptyState.style.display = 'none';
    console.log('电报列表渲染完成');
  }
  
  // 创建电报项目元素
  function createTelegraphItem(telegraph) {
    console.log(`创建电报项目: ${telegraph.id}, 标题: ${telegraph.title}, 重要: ${telegraph.isImportant}`);
    
    const item = document.createElement('div');
    item.className = `telegraph-item ${telegraph.read ? '' : 'unread'} ${telegraph.isImportant ? 'important' : ''}`;
    item.dataset.id = telegraph.id;
    
    // 创建时间元素
    const time = document.createElement('div');
    time.className = 'time';
    // 优先使用原始时间字符串
    if (telegraph.originalTimeStr) {
      time.textContent = telegraph.originalTimeStr;
    } else {
      time.textContent = formatDateTime(new Date(telegraph.timestamp));
    }
    
    // 创建标题元素
    const title = document.createElement('div');
    title.className = 'title';
    
    // 处理标题
    if (telegraph.title && typeof telegraph.title === 'string') {
      console.log(`处理标题: ${telegraph.title.substring(0, 30)}${telegraph.title.length > 30 ? '...' : ''}`);
      
      // 检查是否为百分比格式（如+9.96%）
      const isPercentFormat = /^[+-]\d+\.\d+%$/.test(telegraph.title);
      
      // 检查是否包含HTML标签
      if (telegraph.title.includes('<') && telegraph.title.includes('>')) {
        console.log('标题包含HTML标签，使用innerHTML');
        title.innerHTML = telegraph.title; // 使用innerHTML保留HTML标签
      } else if (isPercentFormat) {
        console.log('百分比格式标题，使用特殊样式');
        // 根据正负值设置不同颜色
        const isPositive = telegraph.title.startsWith('+');
        title.innerHTML = `<span class="${isPositive ? 'percent-positive' : 'percent-negative'}">${telegraph.title}</span>`;
      } else {
        console.log('普通内容，使用textContent');
        title.textContent = telegraph.title;
      }
    } else {
      console.log('标题为空，使用默认标题');
      title.textContent = '无标题';
    }
    
    // 创建内容元素
    const content = document.createElement('div');
    content.className = 'content';
    
    // 处理内容
    if (telegraph.content && typeof telegraph.content === 'string') {
      console.log(`处理内容: ${telegraph.content.substring(0, 30)}${telegraph.content.length > 30 ? '...' : ''}`);
      
      // 检查是否为百分比格式（如+9.96%）
      const isPercentFormat = /^[+-]\d+\.\d+%$/.test(telegraph.content);
      
      // 检查是否包含HTML标签
      if (telegraph.content.includes('<') && telegraph.content.includes('>')) {
        console.log('内容包含HTML标签，使用innerHTML');
        content.innerHTML = telegraph.content; // 使用innerHTML保留HTML标签
      } else if (isPercentFormat) {
        console.log('百分比格式内容，不重复显示');
        // 如果内容是百分比格式，且与标题相同，则不显示内容
        if (telegraph.title === telegraph.content) {
          content.style.display = 'none';
        } else {
          const isPositive = telegraph.content.startsWith('+');
          content.innerHTML = `<span class="${isPositive ? 'percent-positive' : 'percent-negative'}">${telegraph.content}</span>`;
        }
      } else {
        console.log('普通内容，使用textContent');
        content.textContent = telegraph.content;
      }
    } else {
      console.log('内容为空，使用默认内容');
      content.textContent = '无内容';
    }
    
    // 创建来源元素
    const source = document.createElement('div');
    source.className = 'source';
    
    const sourceText = document.createElement('span');
    sourceText.textContent = telegraph.source || '财联社';
    
    const readCount = document.createElement('span');
    readCount.className = 'read-count';
    // 将数字转换为带单位的格式
    const count = telegraph.readCount || 0;
    if (count >= 10000) {
      // 如果大于等于10000，显示为W格式
      readCount.textContent = `阅读量：${(count/10000).toFixed(2)}W`;
    } else {
      // 如果小于10000，直接显示数字
      readCount.textContent = `阅读量：${count}`;
    }
    
    // 如果是重要内容，添加重要标记
    if (telegraph.isImportant) {
      const importantTag = document.createElement('span');
      importantTag.className = 'important-tag';
      importantTag.textContent = '重要';
      source.appendChild(importantTag);
    }
    
    source.appendChild(sourceText);
    source.appendChild(readCount);
    
    item.appendChild(time);
    item.appendChild(title);
    item.appendChild(content);
    item.appendChild(source);
    
    // 移除点击事件，改用 Intersection Observer
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !telegraph.read) {
          console.log(`电报进入视图，自动标记为已读: ${telegraph.id}`);
          markAsRead(telegraph.id);
          item.classList.remove('unread');
          observer.disconnect(); // 一旦标记为已读，就停止观察
        }
      });
    }, {
      threshold: 0.5 // 当50%的内容可见时触发
    });
    
    observer.observe(item);
    
    console.log('电报项目创建完成');
    return item;
  }
  
  // 标记所有电报为已读
  async function markAllAsRead() {
    console.log('开始标记所有电报为已读');
    try {
      const { telegraphs } = await chrome.storage.local.get('telegraphs');
      
      if (telegraphs && telegraphs.length > 0) {
        console.log(`将${telegraphs.length}条电报全部标记为已读`);
        
        const updatedTelegraphs = telegraphs.map(item => {
          return { ...item, read: true };
        });
        
        await chrome.storage.local.set({ telegraphs: updatedTelegraphs });
        console.log('所有电报已成功标记为已读并保存到存储中');
        
        // 更新消息计数和界面
        await updateMessageCounts(updatedTelegraphs);
        renderTelegraphList();
      } else {
        console.log('没有电报数据，无需标记');
      }
    } catch (error) {
      console.error('标记所有电报为已读时出错:', error);
    }
  }
  
  // 标记电报为已读 (保留原有功能，用于单条电报标记)
  async function markAsRead(id) {
    console.log(`开始标记电报为已读: ${id}`);
    try {
      const { telegraphs } = await chrome.storage.local.get('telegraphs');
      
      if (telegraphs) {
        console.log(`找到${telegraphs.length}条电报数据`);
        const updatedTelegraphs = telegraphs.map(item => {
          if (item.id === id) {
            console.log(`找到匹配的电报: ${item.title}`);
            return { ...item, read: true };
          }
          return item;
        });
        
        await chrome.storage.local.set({ telegraphs: updatedTelegraphs });
        console.log('电报已成功标记为已读并保存到存储中');
        
        // 更新消息计数，确保未读数字实时变化
        await updateMessageCounts(updatedTelegraphs);
      } else {
        console.error('无法标记为已读：未找到电报数据');
      }
    } catch (error) {
      console.error('标记电报为已读时出错:', error);
    }
  }
  
  // 刷新数据
  function refreshData() {
    console.log('开始刷新数据');
    // 显示加载状态
    telegraphList.innerHTML = '<div class="loading">正在刷新数据...</div>';
    
    // 发送消息给后台脚本，请求刷新数据
    chrome.runtime.sendMessage({ action: 'fetchTelegraphs' }, response => {
      console.log('收到刷新数据响应:', response);
      if (response && response.success) {
        console.log('刷新数据成功，开始加载数据');
        loadTelegraphData();
      } else {
        console.error('刷新数据失败:', response);
        telegraphList.innerHTML = '<div class="loading">刷新失败，请稍后重试</div>';
      }
    });
  }
  
  // 显示空状态
  function showEmptyState() {
    telegraphList.innerHTML = '';
    emptyState.style.display = 'flex';
  }
  
  // 切换设置面板
  function toggleSettingsPanel() {
    const isVisible = settingsPanel.style.display === 'block';
    settingsPanel.style.display = isVisible ? 'none' : 'block';
  }
  
  // 保存设置
  async function saveSettings() {
    const settings = {
      notificationsEnabled: notificationsEnabled.checked,
      darkMode: darkModeEnabled.checked,
      hotThreshold: parseInt(hotThreshold.value),
      badgeType: badgeTypeSelect.value,
      cacheHours: parseInt(cacheHours.value)
    };
    
    console.log('保存设置:', settings);
    
    await chrome.storage.local.set({ settings });
    
    // 清理过期数据
    await cleanExpiredData(settings.cacheHours);
    
    // 更新徽章显示
    const { telegraphs } = await chrome.storage.local.get('telegraphs');
    if (telegraphs) {
      await updateMessageCounts(telegraphs);
    }
    
    toggleSettingsPanel();
    
    // 重新加载数据以更新计数
    loadTelegraphData();
  }
  
  // 清理过期数据
  async function cleanExpiredData(cacheHours) {
    console.log(`清理${cacheHours}小时前的数据`);
    try {
      const { telegraphs } = await chrome.storage.local.get('telegraphs');
      
      if (telegraphs) {
        const now = new Date();
        const cutoffTime = new Date(now - cacheHours * 60 * 60 * 1000);
        
        const filteredTelegraphs = telegraphs.filter(telegraph => {
          const telegraphTime = new Date(telegraph.timestamp);
          return telegraphTime >= cutoffTime;
        });
        
        console.log(`从${telegraphs.length}条数据中保留${filteredTelegraphs.length}条`);
        await chrome.storage.local.set({ telegraphs: filteredTelegraphs });
      }
    } catch (error) {
      console.error('清理过期数据时出错:', error);
    }
  }
  
  // 格式化日期时间
  function formatDateTime(date) {
    if (!(date instanceof Date) || isNaN(date)) {
      // 不返回"未知时间"，而是返回当前时间
      const now = new Date();
      return `今天 ${padZero(now.getHours())}:${padZero(now.getMinutes())}`;
    }
    
    const now = new Date();
    const diff = now - date;
    const oneDay = 24 * 60 * 60 * 1000;
    
    // 今天的日期
    if (diff < oneDay && date.getDate() === now.getDate()) {
      return `${padZero(date.getHours())}:${padZero(date.getMinutes())}:${padZero(date.getSeconds())}`;
    }
    
    // 昨天的日期
    if (diff < 2 * oneDay && date.getDate() === now.getDate() - 1) {
      return `昨天 ${padZero(date.getHours())}:${padZero(date.getMinutes())}`;
    }
    
    // 其他日期
    return `${date.getFullYear()}-${padZero(date.getMonth() + 1)}-${padZero(date.getDate())} ${padZero(date.getHours())}:${padZero(date.getMinutes())}`;
  }
  
  // 补零
  function padZero(num) {
    return num < 10 ? `0${num}` : num;
  }
});

// 监听来自后台脚本的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('收到消息:', message);
  
  if (message.action === 'updateData') {
    console.log('收到后台更新通知，时间:', message.timestamp);
    
    // 更新最后更新时间显示
    const date = new Date(message.timestamp);
    if (lastUpdateTime) {
      lastUpdateTime.textContent = formatDateTime(date);
    }
    
    // 如果收到了计数信息，直接更新计数
    if (message.counts) {
      console.log('更新计数:', message.counts);
      if (totalCount) totalCount.textContent = message.counts.total;
      if (unreadCount) unreadCount.textContent = message.counts.unread;
      if (importantCount) importantCount.textContent = message.counts.important;
      if (hotCount) hotCount.textContent = message.counts.hot;
      
      // 更新徽章显示
      updateBadgeCount(message.counts);
    }
    
    // 重新加载电报列表以显示最新数据
    loadTelegraphData();
  } else if (message.action === 'newTelegraphs') {
    // 收到新电报通知，刷新列表
    loadTelegraphData();
  }
}); 