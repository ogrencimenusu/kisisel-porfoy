import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, onSnapshot } from 'firebase/firestore';

const Kartlar = () => {
  const [banks, setBanks] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [cards, setCards] = useState([]);
  const [activeModal, setActiveModal] = useState(null);
  const [newBank, setNewBank] = useState({ name: '', code: '', image: null, imagePreview: null });
  const [editingBank, setEditingBank] = useState(null);
  const [originalBank, setOriginalBank] = useState(null);
  const [editingAccount, setEditingAccount] = useState(null);
  const [originalAccount, setOriginalAccount] = useState(null);
  const [editingCard, setEditingCard] = useState(null);
  const [originalCard, setOriginalCard] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [deletingBank, setDeletingBank] = useState(null);
  const [deletingAccount, setDeletingAccount] = useState(null);
  const [deletingCard, setDeletingCard] = useState(null);
  const [newAccount, setNewAccount] = useState({ bankId: '', accountNumber: '', iban: '', accountType: 'Vadesiz Hesap' });
  const [newCard, setNewCard] = useState({ bankId: '', cardNumber: '', cardType: 'Kredi Kartı', limit: '', expiry: '', cvc: '' });
  const [showOperationsSheet, setShowOperationsSheet] = useState(false);
  const [expandedBankIds, setExpandedBankIds] = useState({});
  const [portfolios, setPortfolios] = useState([]);
  const [transactionsByPortfolio, setTransactionsByPortfolio] = useState({});

  // Firebase realtime dinleme
  useEffect(() => {
    const unsubBanks = onSnapshot(collection(db, 'banks'), (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setBanks(data);
    });
    const unsubAccounts = onSnapshot(collection(db, 'accounts'), (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setAccounts(data);
    });
    const unsubCards = onSnapshot(collection(db, 'cards'), (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setCards(data);
    });
    // Listen to portfolios
    const unsubPortfolios = onSnapshot(collection(db, 'portfolios'), (portfolioSnapshot) => {
      const portfolioData = portfolioSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setPortfolios(portfolioData);
    });

    // Listen to all transactions from all portfolios
    const unsubTransactions = onSnapshot(collection(db, 'transactions'), (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      const grouped = data.reduce((acc, tx) => {
        const portfolioId = tx.portfolioId || 'default';
        if (!acc[portfolioId]) acc[portfolioId] = [];
        acc[portfolioId].push(tx);
        return acc;
      }, {});
      setTransactionsByPortfolio(grouped);
    });
    return () => {
      try { unsubBanks(); } catch {}
      try { unsubAccounts(); } catch {}
      try { unsubCards(); } catch {}
      try { unsubPortfolios(); } catch {}
      try { unsubTransactions(); } catch {}
    };
  }, []);

  // Get portfolio holdings for a specific bank
  const getBankPortfolioHoldings = (bankId) => {
    const parseNumber = (val) => {
      if (typeof val === 'number') return isNaN(val) ? 0 : val;
      if (!val) return 0;
      const normalized = String(val)
        .replace(/\s/g, '')
        .replace(/\./g, '')
        .replace(/,/g, '.')
        .replace(/[^0-9.-]/g, '');
      const num = parseFloat(normalized);
      return isNaN(num) ? 0 : num;
    };

    const calcFifoRemaining = (list) => {
      const sorted = [...list].sort((a, b) => {
        const da = a.tarih instanceof Date ? a.tarih : (a.tarih?.toDate?.() || new Date(0));
        const db = b.tarih instanceof Date ? b.tarih : (b.tarih?.toDate?.() || new Date(0));
        return da - db;
      });
      let remainingAdet = 0;
      let remainingMaaliyet = 0;
      const buys = [];
      sorted.forEach(tx => {
        const adet = Number(parseNumber(tx.adet) || 0);
        const maaliyet = Number(parseNumber(tx.maaliyet) || 0);
        const birimFiyat = adet > 0 ? (maaliyet / adet) : 0;
        if ((tx.durum || '') === 'Alış') {
          buys.push({ adet, birimFiyat });
          remainingAdet += adet;
          remainingMaaliyet += maaliyet;
        } else if ((tx.durum || '') === 'Satış') {
          let sellLeft = adet;
          let sellCost = 0;
          while (sellLeft > 0 && buys.length > 0) {
            const b = buys[0];
            const use = Math.min(sellLeft, b.adet);
            sellCost += use * b.birimFiyat;
            b.adet -= use;
            sellLeft -= use;
            if (b.adet <= 0) buys.shift();
          }
          remainingAdet -= adet;
          remainingMaaliyet -= sellCost;
        }
      });
      return { remainingAdet: Number(remainingAdet || 0), remainingMaaliyet: Number(remainingMaaliyet || 0) };
    };

    const holdings = [];
    
    // Get bank name for comparison
    const bank = banks.find(b => b.id === bankId);
    const bankName = bank?.name || '';
    
    // Get all transactions for this bank across all portfolios
    Object.entries(transactionsByPortfolio).forEach(([portfolioId, transactions]) => {
      // Filter transactions by both bank ID and bank name (since platform field can be either)
      const bankTransactions = transactions.filter(tx => {
        const platform = (tx.platform || '').toString();
        return platform === bankId || platform === bankName;
      });
      
      if (bankTransactions.length > 0) {
        // Group by symbol
        const grouped = bankTransactions.reduce((acc, tx) => {
          const symbol = tx.sembol || '—';
          acc[symbol] = acc[symbol] || [];
          acc[symbol].push(tx);
          return acc;
        }, {});

        // Calculate FIFO for each symbol
        Object.entries(grouped).forEach(([symbol, symbolTransactions]) => {
          const fifo = calcFifoRemaining(symbolTransactions);
          if (fifo.remainingAdet > 0) {
            const portfolio = portfolios.find(p => p.id === portfolioId);
            holdings.push({
              portfolioId,
              portfolioName: portfolio?.name || portfolio?.title || 'Bilinmeyen Portföy',
              symbol,
              quantity: fifo.remainingAdet,
              cost: fifo.remainingMaaliyet
            });
          }
        });
      }
    });

    return holdings;
  };

  const fetchBanks = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'banks'));
      const banksData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setBanks(banksData);
    } catch (error) {
      console.error('Banka verileri çekilirken hata:', error);
    }
  };

  const handleEditAccount = (account) => {
    setEditingAccount(account);
    setOriginalAccount(account);
    setNewAccount({
      bankId: account.bankId || '',
      accountNumber: account.accountNumber || '',
      iban: account.iban || '',
      accountType: account.accountType || 'Vadesiz Hesap'
    });
    setActiveModal('editAccount');
  };

  const handleUpdateAccount = async (e) => {
    e.preventDefault();
    if (!editingAccount) return;
    try {
      await updateDoc(doc(db, 'accounts', editingAccount.id), {
        bankId: newAccount.bankId,
        accountNumber: newAccount.accountNumber,
        iban: newAccount.iban || '',
        accountType: newAccount.accountType
      });
      setEditingAccount(null);
      setOriginalAccount(null);
      setActiveModal(null);
      setHasChanges(false);
    } catch (error) {
      console.error('Hesap güncellenirken hata:', error);
    }
  };

  const handleDeleteAccount = (account) => {
    setDeletingAccount(account);
  };

  const confirmDeleteAccount = async () => {
    if (!deletingAccount) return;
    try {
      await deleteDoc(doc(db, 'accounts', deletingAccount.id));
      setDeletingAccount(null);
    } catch (error) {
      console.error('Hesap silinirken hata:', error);
    }
  };

  const cancelDeleteAccount = () => {
    setDeletingAccount(null);
  };

  const handleEditCard = (card) => {
    setEditingCard(card);
    setOriginalCard(card);
    setNewCard({
      bankId: card.bankId || '',
      cardNumber: card.cardNumber || '',
      cardType: card.cardType || 'Kredi Kartı',
      limit: card.limit || '',
      expiry: card.expiry || '',
      cvc: card.cvc || ''
    });
    setActiveModal('editCard');
  };

  const handleUpdateCard = async (e) => {
    e.preventDefault();
    if (!editingCard) return;
    try {
      await updateDoc(doc(db, 'cards', editingCard.id), {
        bankId: newCard.bankId,
        cardNumber: newCard.cardNumber,
        cardType: newCard.cardType,
        limit: newCard.limit,
        expiry: newCard.expiry || '',
        cvc: newCard.cvc || ''
      });
      setEditingCard(null);
      setOriginalCard(null);
      setActiveModal(null);
      setHasChanges(false);
    } catch (error) {
      console.error('Kart güncellenirken hata:', error);
    }
  };

  const handleDeleteCard = (card) => {
    setDeletingCard(card);
  };

  const confirmDeleteCard = async () => {
    if (!deletingCard) return;
    try {
      await deleteDoc(doc(db, 'cards', deletingCard.id));
      setDeletingCard(null);
    } catch (error) {
      console.error('Kart silinirken hata:', error);
    }
  };

  const cancelDeleteCard = () => {
    setDeletingCard(null);
  };

  const fetchAccounts = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'accounts'));
      const accountsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAccounts(accountsData);
    } catch (error) {
      console.error('Hesap verileri çekilirken hata:', error);
    }
  };

  const fetchCards = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'cards'));
      const cardsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCards(cardsData);
    } catch (error) {
      console.error('Kart verileri çekilirken hata:', error);
    }
  };

  const handleModalOpen = (modalType) => {
    setActiveModal(modalType);
    setShowOperationsSheet(false);
  };

  const handleModalClose = () => {
    if (hasChanges) {
      const confirmed = window.confirm('Kaydedilmemiş değişiklikler var. Çıkmak istediğinizden emin misiniz?');
      if (!confirmed) return;
    }
    setActiveModal(null);
    setNewBank({ name: '', code: '', image: null, imagePreview: null });
    setNewAccount({ bankId: '', accountNumber: '', iban: '', accountType: 'Vadesiz Hesap' });
    setNewCard({ bankId: '', cardNumber: '', cardType: 'Kredi Kartı', limit: '', expiry: '', cvc: '' });
    setEditingBank(null);
    setOriginalBank(null);
    setEditingAccount(null);
    setOriginalAccount(null);
    setEditingCard(null);
    setOriginalCard(null);
    setHasChanges(false);
  };

  const handleCancel = () => {
    setActiveModal(null);
    setNewBank({ name: '', code: '', image: null, imagePreview: null });
    setNewAccount({ bankId: '', accountNumber: '', accountType: 'Vadesiz Hesap' });
    setNewCard({ bankId: '', cardNumber: '', cardType: 'Kredi Kartı', limit: '' });
    setEditingBank(null);
    setOriginalBank(null);
    setHasChanges(false);
  };

  const handleBackToOperations = () => {
    if (hasChanges) {
      const confirmed = window.confirm('Kaydedilmemiş değişiklikler var. Geri dönmek istediğinizden emin misiniz?');
      if (!confirmed) return;
    }
    setActiveModal(null);
    setShowOperationsSheet(true);
    setNewBank({ name: '', code: '', image: null, imagePreview: null });
    setNewAccount({ bankId: '', accountNumber: '', iban: '', accountType: 'Vadesiz Hesap' });
    setNewCard({ bankId: '', cardNumber: '', cardType: 'Kredi Kartı', limit: '' });
    setEditingBank(null);
    setOriginalBank(null);
    setEditingAccount(null);
    setOriginalAccount(null);
    setEditingCard(null);
    setOriginalCard(null);
    setHasChanges(false);
  };

  const handleOperationsSheetOpen = () => {
    setShowOperationsSheet(true);
  };

  const handleOperationsSheetClose = () => {
    setShowOperationsSheet(false);
  };

  const toggleBankExpand = (bankId) => {
    setExpandedBankIds((prev) => ({ ...prev, [bankId]: !prev[bankId] }));
  };

  const openAddAccountForBank = (bankId) => {
    setNewAccount((prev) => ({ ...prev, bankId }));
    setActiveModal('addAccount');
    setShowOperationsSheet(false);
  };

  const openAddCardForBank = (bankId) => {
    setNewCard((prev) => ({ ...prev, bankId }));
    setActiveModal('addCard');
    setShowOperationsSheet(false);
  };

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setNewBank({
          ...newBank,
          image: file,
          imagePreview: e.target.result
        });
        setHasChanges(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleInputChange = (field, value) => {
    setNewBank({...newBank, [field]: value});
    setHasChanges(true);
  };

  const handleAccountInputChange = (field, value) => {
    setNewAccount({...newAccount, [field]: value});
    setHasChanges(true);
  };

  const handleCardInputChange = (field, value) => {
    let nextValue = value;
    if (field === 'cardNumber') {
      const digits = String(value || '').replace(/\D/g, '').slice(0, 16);
      nextValue = digits.replace(/(.{4})/g, '$1 ').trim();
    } else if (field === 'expiry') {
      const digits = String(value || '').replace(/\D/g, '').slice(0, 4);
      const mm = digits.slice(0, 2);
      const yy = digits.slice(2, 4);
      nextValue = yy ? `${mm}/${yy}` : mm;
    } else if (field === 'cvc') {
      nextValue = String(value || '').replace(/\D/g, '').slice(0, 3);
    }
    setNewCard({ ...newCard, [field]: nextValue });
    setHasChanges(true);
  };

  const checkForChanges = () => {
    if (activeModal === 'addBank') {
      setHasChanges(newBank.name.trim() !== '' || newBank.code.trim() !== '' || newBank.imagePreview !== null);
    } else if (activeModal === 'editBank' && originalBank) {
      const nameChanged = newBank.name !== originalBank.name;
      const codeChanged = newBank.code !== (originalBank.code || '');
      const imageChanged = newBank.imagePreview !== originalBank.imageUrl;
      setHasChanges(nameChanged || codeChanged || imageChanged);
    } else if (activeModal === 'addAccount') {
      setHasChanges(
        newAccount.bankId !== '' ||
        newAccount.accountNumber.trim() !== '' ||
        newAccount.iban.trim() !== '' ||
        newAccount.accountType !== 'Vadesiz Hesap'
      );
    } else if (activeModal === 'addCard') {
      setHasChanges(newCard.bankId !== '' || newCard.cardNumber.trim() !== '' || newCard.cardType !== 'Kredi Kartı' || newCard.limit.trim() !== '');
    } else if (activeModal === 'editAccount' && originalAccount) {
      const bankChanged = newAccount.bankId !== originalAccount.bankId;
      const numChanged = newAccount.accountNumber !== (originalAccount.accountNumber || '');
      const ibanChanged = (newAccount.iban || '') !== (originalAccount.iban || '');
      const typeChanged = newAccount.accountType !== (originalAccount.accountType || 'Vadesiz Hesap');
      setHasChanges(bankChanged || numChanged || ibanChanged || typeChanged);
    } else if (activeModal === 'editCard' && originalCard) {
      const bankChanged = newCard.bankId !== originalCard.bankId;
      const numChanged = newCard.cardNumber !== (originalCard.cardNumber || '');
      const typeChanged = newCard.cardType !== (originalCard.cardType || 'Kredi Kartı');
      const limitChanged = (newCard.limit || '') !== (originalCard.limit || '');
      setHasChanges(bankChanged || numChanged || typeChanged || limitChanged);
    }
  };

  useEffect(() => {
    checkForChanges();
  }, [newBank, newAccount, newCard, activeModal, originalBank]);

  const handleAddBank = async (e) => {
    e.preventDefault();
    if (!newBank.name.trim()) return;

    try {
      await addDoc(collection(db, 'banks'), {
        name: newBank.name,
        code: newBank.code,
        imageUrl: newBank.imagePreview,
        createdAt: new Date()
      });
      
      setNewBank({ name: '', code: '', image: null, imagePreview: null });
      setHasChanges(false);
      setActiveModal(null);
    } catch (error) {
      console.error('Banka eklenirken hata:', error);
    }
  };

  const handleDeleteBank = async (bank) => {
    setDeletingBank(bank);
    
    // Debug: Show all transactions for this bank when opening delete sheet
    console.log('=== Banka Silme Sheet Açılıyor ===');
    console.log('Banka ID:', bank.id);
    console.log('Banka Adı:', bank.name);
    console.log('transactionsByPortfolio state:', transactionsByPortfolio);
    console.log('Portfolios state:', portfolios);
    
    // If transactionsByPortfolio is empty, try to fetch manually
    if (Object.keys(transactionsByPortfolio).length === 0) {
      console.log('transactionsByPortfolio boş, manuel olarak çekiliyor...');
      
      try {
        const allTransactions = {};
        
        // Fetch transactions from each portfolio's subcollection
        for (const portfolio of portfolios) {
          const txSnapshot = await getDocs(collection(db, 'portfolios', portfolio.id, 'transactions'));
          const txData = txSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
          allTransactions[portfolio.id] = txData;
        }
        
        console.log('Manuel olarak çekilen transactions:', allTransactions);
        setTransactionsByPortfolio(allTransactions);
        
        // Now check for bank transactions
        const bankName = bank?.name || '';
        Object.entries(allTransactions).forEach(([portfolioId, transactions]) => {
          const bankTransactions = transactions.filter(tx => {
            const platform = (tx.platform || '').toString();
            return platform === bank.id || platform === bankName;
          });
          
          if (bankTransactions.length > 0) {
            console.log(`Portföy ${portfolioId} için bulunan transaction'lar:`, bankTransactions);
          }
        });
        
      } catch (error) {
        console.error('Transactionları çekerken hata:', error);
      }
    } else {
      // Original logic if transactionsByPortfolio is not empty
      const bankName = bank?.name || '';
      
      Object.entries(transactionsByPortfolio).forEach(([portfolioId, transactions]) => {
        const bankTransactions = transactions.filter(tx => {
          const platform = (tx.platform || '').toString();
          return platform === bank.id || platform === bankName;
        });
        
        if (bankTransactions.length > 0) {
          console.log(`Portföy ${portfolioId} için bulunan transaction'lar:`, bankTransactions);
        }
      });
    }
    
    console.log('=== Banka Silme Sheet Debug Tamamlandı ===');
  };

  const confirmDeleteBank = async () => {
    if (!deletingBank) return;
    try {
      const relatedAccounts = accounts.filter(a => a.bankId === deletingBank.id);
      const relatedCards = cards.filter(c => c.bankId === deletingBank.id);
      await Promise.all([
        deleteDoc(doc(db, 'banks', deletingBank.id)),
        ...relatedAccounts.map(a => deleteDoc(doc(db, 'accounts', a.id))),
        ...relatedCards.map(c => deleteDoc(doc(db, 'cards', c.id)))
      ]);
      setDeletingBank(null);
    } catch (error) {
      console.error('Banka silinirken hata:', error);
    }
  };

  const cancelDeleteBank = () => {
    setDeletingBank(null);
  };

  const handleAddAccount = async (e) => {
    e.preventDefault();
    if (!newAccount.bankId || !newAccount.accountNumber.trim()) return;

    try {
      const selectedBank = banks.find(bank => bank.id === newAccount.bankId);
      await addDoc(collection(db, 'accounts'), {
        bankId: newAccount.bankId,
        bankName: selectedBank?.name || '',
        accountNumber: newAccount.accountNumber,
        iban: newAccount.iban || '',
        accountType: newAccount.accountType,
        createdAt: new Date()
      });
      
      setNewAccount({ bankId: '', accountNumber: '', iban: '', accountType: 'Vadesiz Hesap' });
      setHasChanges(false);
      setActiveModal(null);
    } catch (error) {
      console.error('Hesap eklenirken hata:', error);
    }
  };

  const handleAddCard = async (e) => {
    e.preventDefault();
    if (!newCard.bankId || !newCard.cardNumber.trim()) return;

    try {
      const selectedBank = banks.find(bank => bank.id === newCard.bankId);
      await addDoc(collection(db, 'cards'), {
        bankId: newCard.bankId,
        bankName: selectedBank?.name || '',
        cardNumber: newCard.cardNumber,
        cardType: newCard.cardType,
        limit: newCard.limit,
        expiry: newCard.expiry || '',
        cvc: newCard.cvc || '',
        createdAt: new Date()
      });
      
      setNewCard({ bankId: '', cardNumber: '', cardType: 'Kredi Kartı', limit: '', expiry: '', cvc: '' });
      setHasChanges(false);
      setActiveModal(null);
    } catch (error) {
      console.error('Kart eklenirken hata:', error);
    }
  };

  const handleEditBank = (bank) => {
    setEditingBank(bank);
    setOriginalBank({
      name: bank.name,
      code: bank.code || '',
      imageUrl: bank.imageUrl || null
    });
    setNewBank({
      name: bank.name,
      code: bank.code || '',
      image: null,
      imagePreview: bank.imageUrl || null
    });
    setActiveModal('editBank');
    setHasChanges(false);
  };

  const handleUpdateBank = async (e) => {
    e.preventDefault();
    if (!newBank.name.trim() || !editingBank) return;

    try {
      await updateDoc(doc(db, 'banks', editingBank.id), {
        name: newBank.name,
        code: newBank.code,
        imageUrl: newBank.imagePreview,
        updatedAt: new Date()
      });
      
      setNewBank({ name: '', code: '', image: null, imagePreview: null });
      setEditingBank(null);
      setOriginalBank(null);
      setHasChanges(false);
      fetchBanks(); // Verileri yeniden çek
      setActiveModal(null);
    } catch (error) {
      console.error('Banka güncellenirken hata:', error);
    }
  };

  return (
    <div className="container-fluid py-4">
      <div className="row">
        <div className="col-12">
          <div className="d-flex justify-content-between align-items-center mb-4">
            <h1 className="display-6 mb-0">
              <i className="bi bi-credit-card me-3"></i>Kartlar ve Hesaplar
            </h1>
            <button 
              className="btn btn-outline-primary rounded-circle"
              onClick={handleOperationsSheetOpen}
              style={{ width: '40px', height: '40px' }}
            >
              <i className="bi bi-plus"></i>
            </button>
          </div>
        </div>
      </div>

      {/* Gruplu Liste: Banka altında hesaplar ve kartlar */}
      <div className="row">
        <div className="col-12 mb-4">
          <div className="card border-0 h-100">
            <div className="card-header border-bottom-1 bg-transparent">
              <h5 className="mb-0">
                Ekli Bankalar
              </h5>
            </div>
            <div className="card-body">
              {banks.length > 0 ? (
                <div>
                  {banks.map(bank => (
                    <div key={bank.id} className={`list-item-card ${expandedBankIds[bank.id] ? 'border border-success' : ''}`}>
                      <div className="d-flex align-items-center justify-content-between">
                        <div className="d-flex align-items-center">
                          <button 
                            className="btn btn-sm btn-outline-secondary me-2"
                            onClick={() => toggleBankExpand(bank.id)}
                            aria-label="Kart ve hesapları göster/gizle"
                          >
                            <i className={`bi ${expandedBankIds[bank.id] ? 'bi-chevron-down' : 'bi-chevron-right'}`}></i>
                          </button>
                          <div className="avatar me-3">
                            {bank.imageUrl ? (
                              <img src={bank.imageUrl} alt={`${bank.name} logosu`} className="avatar-img" />
                            ) : (
                              <i className="bi bi-building text-primary" style={{ fontSize: '1.2rem' }}></i>
                            )}
                          </div>
                          <div>
                            <div className="fw-semibold" style={{ fontSize: '1rem' }}>{bank.name}</div>
                            {bank.code && (
                              <div className="subtitle-bubble mt-2">Kod: {bank.code}</div>
                            )}
                          </div>
                        </div>
                        <div className="d-flex align-items-center gap-2">
                          <button 
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() => handleEditBank(bank)}
                            title="Düzenle"
                          >
                            <i className="bi bi-pencil"></i>
                          </button>
                          <button 
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => handleDeleteBank(bank)}
                            title="Sil"
                          >
                            <i className="bi bi-trash"></i>
                          </button>
                        </div>
                      </div>
                      {expandedBankIds[bank.id] && (
                        <div className="mt-3">
                          {/* Hesaplar */}
                          <div className="mb-3">
                            <div className="d-flex align-items-center mb-2">
                              <button 
                                type="button"
                                className="btn btn-sm btn-outline-primary me-2"
                                onClick={() => openAddAccountForBank(bank.id)}
                                title="Hesap ekle"
                              >
                                <i className="bi bi-plus"></i>
                              </button>
                              <i className="bi bi-wallet2 me-2 text-success"></i>
                              <strong>Hesaplar</strong>
                            </div>
                            {accounts.filter(a => a.bankId === bank.id).length > 0 ? (
                              accounts.filter(a => a.bankId === bank.id).map(account => (
                                <div key={account.id} className="d-flex align-items-center justify-content-between py-2">
                                  <div className="d-flex flex-column">
                                    <span className="fw-semibold">{account.accountType || 'Hesap'}</span>
                                    {account.iban && (
                                      <small className="text-muted">{account.iban}</small>
                                    )}
                                  </div>
                                  <div className="d-flex align-items-center gap-2">
                                    <button className="btn btn-sm btn-outline-secondary" onClick={() => handleEditAccount(account)} title="Düzenle">
                                      <i className="bi bi-pencil"></i>
                                    </button>
                                    <button className="btn btn-sm btn-outline-danger" onClick={() => handleDeleteAccount(account)} title="Sil">
                                      <i className="bi bi-trash"></i>
                                    </button>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="text-muted">Hesap yok</div>
                            )}
                          </div>

                          {/* Kartlar */}
                          <div>
                            <div className="d-flex align-items-center mb-2">
                              <button 
                                type="button"
                                className="btn btn-sm btn-outline-primary me-2"
                                onClick={() => openAddCardForBank(bank.id)}
                                title="Kart ekle"
                              >
                                <i className="bi bi-plus"></i>
                              </button>
                              <i className="bi bi-credit-card me-2 text-warning"></i>
                              <strong>Kartlar</strong>
                            </div>
                            {cards.filter(c => c.bankId === bank.id).length > 0 ? (
                              cards.filter(c => c.bankId === bank.id).map(card => (
                                <div key={card.id} className="d-flex align-items-center justify-content-between py-2">
                                  <div className="d-flex flex-column">
                                    <span className="fw-semibold">{card.cardNumber}</span>
                                    <div className="d-flex align-items-center gap-2 flex-wrap">
                                      <span className="badge bg-secondary">{card.cardType}</span>
                                      {card.expiry && <small className="text-muted">SKT: {card.expiry}</small>}
                                      {card.cvc && <small className="text-muted">CVC: {card.cvc}</small>}
                                      {card.limit && <small className="text-muted">Limit: {card.limit}</small>}
                                    </div>
                                  </div>
                                  <div className="d-flex align-items-center gap-2">
                                    <button className="btn btn-sm btn-outline-secondary" onClick={() => handleEditCard(card)} title="Düzenle">
                                      <i className="bi bi-pencil"></i>
                                    </button>
                                    <button className="btn btn-sm btn-outline-danger" onClick={() => handleDeleteCard(card)} title="Sil">
                                      <i className="bi bi-trash"></i>
                                    </button>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="text-muted">Kart yok</div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted text-center">Henüz banka eklenmemiş</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Operations Sheet */}
      {showOperationsSheet && (
        <div 
          className="modal-backdrop"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'var(--sheet-backdrop)',
            zIndex: 1050,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center'
          }}
          onClick={handleOperationsSheetClose}
        >
          <div 
            className="modal-content" 
            style={{
              backgroundColor: 'var(--sheet-bg)',
              color: 'var(--text)',
              width: '100%',
              maxWidth: '500px',
              borderTopLeftRadius: '20px',
              borderTopRightRadius: '20px',
              padding: '20px',
              maxHeight: '80vh',
              overflowY: 'auto',
              transform: 'translateY(0)',
              transition: 'transform 0.3s ease-out',
              boxShadow: 'var(--sheet-shadow)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sheet Header */}
            <div className="d-flex justify-content-between align-items-center mb-4">
              <h5 className="mb-0">
                <i className="bi bi-plus-circle me-2"></i>İşlemler
              </h5>
              <button 
                className="btn-close" 
                onClick={handleOperationsSheetClose}
                style={{ fontSize: '1.2rem' }}
              ></button>
            </div>

            {/* Sheet Body */}
            <div className="modal-body">
              <div className="list-group list-group-flush">
                {/* Banka Ekleme */}
                <button 
                  className="list-group-item list-group-item-action d-flex justify-content-between align-items-center border-0 px-0 py-3"
                  onClick={() => handleModalOpen('addBank')}
                >
                  <div className="d-flex align-items-center">
                    <i className="bi bi-building text-primary me-3" style={{ fontSize: '1.2rem' }}></i>
                    <div>
                      <h6 className="mb-0">Banka Ekle</h6>
                      <small className="text-muted">Yeni banka hesabı ekle</small>
                    </div>
                  </div>
                  <i className="bi bi-chevron-right text-muted"></i>
                </button>

                {/* Hesap Ekleme */}
                <button 
                  className="list-group-item list-group-item-action d-flex justify-content-between align-items-center border-0 px-0 py-3"
                  onClick={() => handleModalOpen('addAccount')}
                >
                  <div className="d-flex align-items-center">
                    <i className="bi bi-wallet2 text-success me-3" style={{ fontSize: '1.2rem' }}></i>
                    <div>
                      <h6 className="mb-0">Hesap Ekle</h6>
                      <small className="text-muted">Yeni banka hesabı ekle</small>
                    </div>
                  </div>
                  <i className="bi bi-chevron-right text-muted"></i>
                </button>

                {/* Kart Ekleme */}
                <button 
                  className="list-group-item list-group-item-action d-flex justify-content-between align-items-center border-0 px-0 py-3"
                  onClick={() => handleModalOpen('addCard')}
                >
                  <div className="d-flex align-items-center">
                    <i className="bi bi-credit-card text-warning me-3" style={{ fontSize: '1.2rem' }}></i>
                    <div>
                      <h6 className="mb-0">Kart Ekle</h6>
                      <small className="text-muted">Yeni kredi/banka kartı ekle</small>
                    </div>
                  </div>
                  <i className="bi bi-chevron-right text-muted"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* iOS Sheet Style Modals */}
      {activeModal && (
        <div 
          className="modal-backdrop" 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'var(--sheet-backdrop)',
            zIndex: 1050,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center'
          }}
          onClick={handleBackToOperations}
        >
          <div 
            className="modal-content" 
            style={{
              backgroundColor: 'var(--sheet-bg)',
              color: 'var(--text)',
              width: '100%',
              maxWidth: '500px',
              borderTopLeftRadius: '20px',
              borderTopRightRadius: '20px',
              padding: '20px',
              maxHeight: '80vh',
              overflowY: 'auto',
              transform: 'translateY(0)',
              transition: 'transform 0.3s ease-out',
              boxShadow: 'var(--sheet-shadow)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="d-flex justify-content-between align-items-center mb-4">
              <div className="d-flex align-items-center">
                <button 
                  className="btn btn-link p-0 me-3"
                  onClick={handleBackToOperations}
                  style={{ fontSize: '1.2rem' }}
                >
                  <i className="bi bi-chevron-left"></i>
                </button>
                <h5 className="mb-0">
                  {activeModal === 'addBank' && <><i className="bi bi-building me-2"></i>Banka Ekle</>}
                  {activeModal === 'editBank' && <><i className="bi bi-pencil me-2"></i>Banka Düzenle</>}
                  {activeModal === 'addAccount' && <><i className="bi bi-wallet2 me-2"></i>Hesap Ekle</>}
                  {activeModal === 'addCard' && <><i className="bi bi-credit-card me-2"></i>Kart Ekle</>}
                  {activeModal === 'editAccount' && <><i className="bi bi-pencil me-2"></i>Hesap Düzenle</>}
                  {activeModal === 'editCard' && <><i className="bi bi-pencil me-2"></i>Kart Düzenle</>}
                </h5>
              </div>
              {(activeModal === 'addBank' || activeModal === 'editBank' || activeModal === 'addAccount' || activeModal === 'addCard' || activeModal === 'editAccount' || activeModal === 'editCard') && (
                <div className="d-flex gap-2">
                  <button 
                    className="btn btn-outline-secondary btn-sm"
                    onClick={handleCancel}
                  >
                    <i className="bi bi-x me-1"></i>İptal
                  </button>
                  <button 
                    className="btn btn-primary btn-sm"
                    onClick={
                      activeModal === 'addBank' ? handleAddBank :
                      activeModal === 'editBank' ? handleUpdateBank :
                      activeModal === 'addAccount' ? handleAddAccount :
                      activeModal === 'addCard' ? handleAddCard :
                      activeModal === 'editAccount' ? handleUpdateAccount :
                      activeModal === 'editCard' ? handleUpdateCard : null
                    }
                    disabled={
                      activeModal === 'addBank' ? !newBank.name.trim() :
                      activeModal === 'editBank' ? !newBank.name.trim() :
                      activeModal === 'addAccount' ? !newAccount.bankId || !newAccount.accountNumber.trim() :
                      activeModal === 'addCard' ? !newCard.bankId || !newCard.cardNumber.trim() || !newCard.expiry.trim() || !newCard.cvc.trim() :
                      activeModal === 'editAccount' ? !newAccount.bankId || !newAccount.accountNumber.trim() :
                      activeModal === 'editCard' ? !newCard.bankId || !newCard.cardNumber.trim() || !newCard.expiry.trim() || !newCard.cvc.trim() : true
                    }
                  >
                    {activeModal === 'addBank' && (
                      <>
                        <i className="bi bi-check me-1"></i>Kaydet
                      </>
                    )}
                    {activeModal === 'editBank' && (
                      <>
                        <i className="bi bi-check me-1"></i>Güncelle
                      </>
                    )}
                    {activeModal === 'addAccount' && (
                      <>
                        <i className="bi bi-check me-1"></i>Kaydet
                      </>
                    )}
                    {activeModal === 'addCard' && (
                      <>
                        <i className="bi bi-check me-1"></i>Kaydet
                      </>
                    )}
                    {activeModal === 'editAccount' && (
                      <>
                        <i className="bi bi-check me-1"></i>Güncelle
                      </>
                    )}
                    {activeModal === 'editCard' && (
                      <>
                        <i className="bi bi-check me-1"></i>Güncelle
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Modal Body */}
            <div className="modal-body">
              {(activeModal === 'addBank' || activeModal === 'editBank') && (
                <form onSubmit={activeModal === 'addBank' ? handleAddBank : handleUpdateBank}>
                  <div className="mb-3">
                    <label className="form-label">Banka Adı</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="Banka adını girin"
                      value={newBank.name}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Banka Kodu (Opsiyonel)</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="Banka kodunu girin"
                      value={newBank.code}
                      onChange={(e) => handleInputChange('code', e.target.value)}
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Banka Logosu </label>
                    <div className="text-center d-flex justify-content-center">
                      {newBank.imagePreview ? (
                        <div className="mb-3">
                          <img 
                            src={newBank.imagePreview} 
                            alt="Banka logosu önizleme"
                            className="img-fluid rounded"
                            style={{ 
                              maxWidth: '120px', 
                              maxHeight: '120px',
                              objectFit: 'contain',
                              border: '2px solid #dee2e6'
                            }}
                          />
                          <div className="mt-2">
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger"
                              onClick={() => {
                                setNewBank({...newBank, image: null, imagePreview: null});
                                setHasChanges(true);
                              }}
                            >
                              <i className="bi bi-trash me-1"></i>Kaldır
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div 
                          className="border border-dashed rounded p-4 mb-3"
                          style={{ 
                            borderColor: '#dee2e6',
                            backgroundColor: '#f8f9fa',
                            minHeight: '120px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <i className="bi bi-image text-muted mb-2" style={{ fontSize: '2rem' }}></i>
                          <p className="text-muted mb-2">Banka logosu seçin</p>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleImageSelect}
                            className="form-control"
                            style={{ maxWidth: '200px' }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </form>
              )}

              {(activeModal === 'addAccount' || activeModal === 'editAccount') && (
                <form onSubmit={handleAddAccount}>
                  <div className="mb-3">
                    <label className="form-label">Banka Seçin</label>
                    <select 
                      className="form-select"
                      value={newAccount.bankId}
                      onChange={(e) => handleAccountInputChange('bankId', e.target.value)}
                      required
                    >
                      <option value="">Banka seçin</option>
                      {banks.map(bank => (
                        <option key={bank.id} value={bank.id}>{bank.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Hesap Numarası</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="Hesap numarasını girin"
                      value={newAccount.accountNumber}
                      onChange={(e) => handleAccountInputChange('accountNumber', e.target.value)}
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Hesap IBAN Numarası</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="IBAN numarasını girin (örn. TR...)"
                      value={newAccount.iban}
                      onChange={(e) => handleAccountInputChange('iban', e.target.value)}
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Hesap Türü</label>
                    <select 
                      className="form-select"
                      value={newAccount.accountType}
                      onChange={(e) => handleAccountInputChange('accountType', e.target.value)}
                    >
                      <option value="Vadeli Hesap">Vadeli Hesap</option>
                      <option value="Vadesiz Hesap">Vadesiz Hesap</option>
                      <option value="Birikim Hesabı">Birikim Hesabı</option>
                    </select>
                  </div>
                </form>
              )}

              {(activeModal === 'addCard' || activeModal === 'editCard') && (
                <form onSubmit={handleAddCard}>
                  <div className="mb-3">
                    <label className="form-label">Banka Seçin</label>
                    <select 
                      className="form-select"
                      value={newCard.bankId}
                      onChange={(e) => handleCardInputChange('bankId', e.target.value)}
                      required
                    >
                      <option value="">Banka seçin</option>
                      {banks.map(bank => (
                        <option key={bank.id} value={bank.id}>{bank.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Kart Numarası</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="Kart numarasını girin"
                      value={newCard.cardNumber}
                      onChange={(e) => handleCardInputChange('cardNumber', e.target.value)}
                      required
                    />
                  </div>
                  <div className="row">
                    <div className="col-6">
                      <div className="mb-3">
                        <label className="form-label">SKT (AA/YY)</label>
                        <input 
                          type="text" 
                          className="form-control" 
                          placeholder="AA/YY"
                          value={newCard.expiry}
                          onChange={(e) => handleCardInputChange('expiry', e.target.value)}
                          inputMode="numeric"
                          maxLength={5}
                        />
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="mb-3">
                        <label className="form-label">CVC</label>
                        <input 
                          type="text" 
                          className="form-control" 
                          placeholder="000"
                          value={newCard.cvc}
                          onChange={(e) => handleCardInputChange('cvc', e.target.value)}
                          inputMode="numeric"
                          maxLength={3}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Kart Türü</label>
                    <select 
                      className="form-select"
                      value={newCard.cardType}
                      onChange={(e) => handleCardInputChange('cardType', e.target.value)}
                    >
                      <option value="Kredi Kartı">Kredi Kartı</option>
                      <option value="Banka Kartı">Banka Kartı</option>
                      <option value="Debit Kart">Debit Kart</option>
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Limit</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="Kart limitini girin"
                      value={newCard.limit}
                      onChange={(e) => handleCardInputChange('limit', e.target.value)}
                    />
                  </div>
                </form>
              )}

            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Sheet */}
      {deletingBank && (
        <div 
          className="modal-backdrop" 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'var(--sheet-backdrop)',
            zIndex: 1050,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center'
          }}
          onClick={cancelDeleteBank}
        >
          <div 
            className="modal-content" 
            style={{
              backgroundColor: 'var(--sheet-bg)',
              color: 'var(--text)',
              width: '100%',
              maxWidth: '500px',
              borderTopLeftRadius: '20px',
              borderTopRightRadius: '20px',
              padding: '20px',
              maxHeight: '80vh',
              overflowY: 'auto',
              transform: 'translateY(0)',
              transition: 'transform 0.3s ease-out',
              boxShadow: 'var(--sheet-shadow)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sheet Header */}
            <div className="d-flex justify-content-between align-items-center mb-4">
              <h5 className="mb-0 text-danger">
                <i className="bi bi-exclamation-triangle me-2"></i>Banka Sil
              </h5>
              <div className="d-flex gap-2">
                <button className="btn btn-outline-secondary" onClick={cancelDeleteBank}>İptal</button>
                <button 
                  className="btn btn-danger "
                  onClick={confirmDeleteBank}
                >
                  <i className="bi bi-trash me-2"></i>Sil
                </button>
              </div>
            </div>

            {/* Sheet Body */}
            <div className="modal-body ">
              <h6 className="mb-3">Bu bankayı silmek istediğinizden emin misiniz?</h6>
              
              <div className="card border-danger mb-4">
                <div className="card-body">
                  <div className="d-flex align-items-center">
                    {deletingBank.imageUrl ? (
                      <img 
                        src={deletingBank.imageUrl} 
                        alt={`${deletingBank.name} logosu`}
                        className="me-3 rounded"
                        style={{ 
                          width: '40px', 
                          height: '40px',
                          objectFit: 'contain',
                          backgroundColor: '#f8f9fa',
                          border: '1px solid #dee2e6'
                        }}
                      />
                    ) : (
                      <i className="bi bi-building text-primary me-3" style={{ fontSize: '1.5rem' }}></i>
                    )}
                    <div className="text-start">
                      <h6 className="mb-1">{deletingBank.name}</h6>
                      {deletingBank.code && (
                        <small className="text-muted">Kod: {deletingBank.code}</small>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <p className="text-muted mb-3">
                Bu işlem geri alınamaz. Banka ve tüm ilişkili veriler kalıcı olarak silinecektir.
              </p>

              {(() => {
                const holdings = getBankPortfolioHoldings(deletingBank.id);
                if (holdings.length > 0) {
                  return (
                    <div className="alert alert-warning mb-3">
                      <i className="bi bi-exclamation-triangle me-2"></i>
                      <strong>Dikkat!</strong> Bu bankada portföy hisseleri bulunmaktadır. 
                      Banka silindiğinde bu hisseler portföyde kalacak ancak platform bilgisi kaybolacaktır.
                    </div>
                  );
                }
                return null;
              })()}

              <div className="row g-3">
                <div className="col-12 col-md-4">
                  <div className="card h-100">
                    <div className="card-header bg-success text-white py-2">
                      <strong>Bağlı Hesaplar</strong>
                    </div>
                    <div className="card-body p-2">
                      {accounts.filter(a => a.bankId === deletingBank.id).length > 0 ? (
                        <ul className="list-group list-group-flush small">
                          {accounts.filter(a => a.bankId === deletingBank.id).map(a => (
                            <li key={a.id} className="list-group-item d-flex justify-content-between align-items-center">
                              <span>{a.accountNumber}</span>
                              {a.iban && <span className="text-muted">{a.iban}</span>}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="text-muted">Hesap yok</div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="col-12 col-md-4">
                  <div className="card h-100">
                    <div className="card-header bg-warning py-2">
                      <strong>Kartlar</strong>
                    </div>
                    <div className="card-body p-2">
                      {cards.filter(c => c.bankId === deletingBank.id).length > 0 ? (
                        <ul className="list-group list-group-flush small">
                          {cards.filter(c => c.bankId === deletingBank.id).map(c => (
                            <li key={c.id} className="list-group-item d-flex justify-content-between align-items-center">
                              <span>{c.cardNumber}</span>
                              <span className="text-muted">{c.cardType}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="text-muted">Kart yok</div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="col-12 col-md-4">
                  <div className="card h-100">
                    <div className="card-header bg-info text-white py-2">
                      <strong>Portföy Hisseleri</strong>
                    </div>
                    <div className="card-body p-2">
                      {(() => {
                        const holdings = getBankPortfolioHoldings(deletingBank.id);
                        return holdings.length > 0 ? (
                          <ul className="list-group list-group-flush small">
                            {holdings.map((holding, index) => (
                              <li key={index} className="list-group-item">
                                <div className="d-flex justify-content-between align-items-start">
                                  <div>
                                    <strong>{holding.symbol}</strong>
                                    <br />
                                    <small className="text-muted">{holding.portfolioName}</small>
                                  </div>
                                  <div className="text-end">
                                    <span className="badge bg-primary">{holding.quantity} adet</span>
                                  </div>
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="text-muted">Hisse yok</div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Account Delete Confirmation Sheet */}
      {deletingAccount && (
        <div 
          className="modal-backdrop" 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'var(--sheet-backdrop)',
            zIndex: 1050,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center'
          }}
          onClick={cancelDeleteAccount}
        >
          <div 
            className="modal-content" 
            style={{
              backgroundColor: 'var(--sheet-bg)',
              color: 'var(--text)',
              width: '100%',
              maxWidth: '500px',
              borderTopLeftRadius: '20px',
              borderTopRightRadius: '20px',
              padding: '20px',
              maxHeight: '80vh',
              overflowY: 'auto',
              transform: 'translateY(0)',
              transition: 'transform 0.3s ease-out',
              boxShadow: 'var(--sheet-shadow)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h5 className="mb-0 text-danger"><i className="bi bi-exclamation-triangle me-2"></i>Hesap Sil</h5>
              <div className="d-flex gap-2">
                <button className="btn btn-outline-secondary" onClick={cancelDeleteAccount}>İptal</button>
                <button className="btn btn-danger" onClick={confirmDeleteAccount}><i className="bi bi-trash me-2"></i>Sil</button>
              </div>
            </div>
            <div className="modal-body">
              <p>Bu hesabı silmek istediğinizden emin misiniz?</p>
              <div className="list-group list-group-flush">
                <div className="list-group-item d-flex justify-content-between">
                  <span>Hesap No</span>
                  <strong>{deletingAccount.accountNumber}</strong>
                </div>
                {deletingAccount.iban && (
                  <div className="list-group-item d-flex justify-content-between">
                    <span>IBAN</span>
                    <span className="text-muted">{deletingAccount.iban}</span>
                  </div>
                )}
                <div className="list-group-item d-flex justify-content-between">
                  <span>Tür</span>
                  <span className="text-muted">{deletingAccount.accountType}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Card Delete Confirmation Sheet */}
      {deletingCard && (
        <div 
          className="modal-backdrop" 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'var(--sheet-backdrop)',
            zIndex: 1050,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center'
          }}
          onClick={cancelDeleteCard}
        >
          <div 
            className="modal-content" 
            style={{
              backgroundColor: 'var(--sheet-bg)',
              color: 'var(--text)',
              width: '100%',
              maxWidth: '500px',
              borderTopLeftRadius: '20px',
              borderTopRightRadius: '20px',
              padding: '20px',
              maxHeight: '80vh',
              overflowY: 'auto',
              transform: 'translateY(0)',
              transition: 'transform 0.3s ease-out',
              boxShadow: 'var(--sheet-shadow)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h5 className="mb-0 text-danger"><i className="bi bi-exclamation-triangle me-2"></i>Kart Sil</h5>
              <div className="d-flex gap-2">
                <button className="btn btn-outline-secondary" onClick={cancelDeleteCard}>İptal</button>
                <button className="btn btn-danger" onClick={confirmDeleteCard}><i className="bi bi-trash me-2"></i>Sil</button>
              </div>
            </div>
            <div className="modal-body">
              <p>Bu kartı silmek istediğinizden emin misiniz?</p>
              <div className="list-group list-group-flush">
                <div className="list-group-item d-flex justify-content-between">
                  <span>Kart No</span>
                  <strong>{deletingCard.cardNumber}</strong>
                </div>
                <div className="list-group-item d-flex justify-content-between">
                  <span>Tür</span>
                  <span className="text-muted">{deletingCard.cardType}</span>
                </div>
                {deletingCard.limit && (
                  <div className="list-group-item d-flex justify-content-between">
                    <span>Limit</span>
                    <span className="text-muted">{deletingCard.limit}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Kartlar;

