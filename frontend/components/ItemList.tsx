import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Item, AccountDetail } from '../types';
import { getItems, getAccountDetails, syncItemsFromAccount, createItem } from '../services/api';
import { Box, RefreshCw, ShoppingBag, Edit, Trash2, Plus, Save, X, Eye, EyeOff } from 'lucide-react';
import { useSpectralAction } from './brand/SpectralHook';

const ItemList: React.FC = () => {
  const { runSpectralAction } = useSpectralAction();
  const [items, setItems] = useState<Item[]>([]);
  const [accounts, setAccounts] = useState<AccountDetail[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [editForm, setEditForm] = useState<Partial<Item>>({});
  const [addForm, setAddForm] = useState({
    cookie_id: '',
    item_id: '',
    item_title: '',
    item_price: '',
    item_image: '',
    is_multi_spec: false,
    is_multi_qty_ship: false
  });

  useEffect(() => {
    getAccountDetails().then(setAccounts);
    getItems().then(setItems);
  }, []);

  const handleSync = async () => {
      if (!selectedAccount) {
        alert('请先选择账号');
        return { success: false };
      }
      setLoading(true);
      try {
        const result = await syncItemsFromAccount(selectedAccount);
        if (!result?.success) {
          throw new Error(result?.message || '同步失败');
        }
        setItems(await getItems());
        alert(result.message || '商品同步成功');
        return { success: true };
      } catch (error) {
        console.error('同步商品失败:', error);
        alert(`同步失败：${error instanceof Error ? error.message : '请检查账号登录状态'}`);
        return { success: false };
      } finally {
        setLoading(false);
      }
  };

  const handleEdit = (item: Item) => {
    setSelectedItem(item);
    setEditForm({ ...item });
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedItem) return;
    try {
      const updatedItems = items.map(item =>
        item.cookie_id === selectedItem.cookie_id && item.item_id === selectedItem.item_id
          ? { ...item, ...editForm }
          : item
      );
      setItems(updatedItems);
      setShowEditModal(false);
    } catch (error) {
      console.error('更新商品失败:', error);
      alert('更新失败，请重试');
    }
  };

  const handleDelete = async (item: Item) => {
    if (confirm(`确认删除商品"${item.item_title}"吗？`)) {
      try {
        const filteredItems = items.filter(i =>
          !(i.cookie_id === item.cookie_id && i.item_id === item.item_id)
        );
        setItems(filteredItems);
      } catch (error) {
        console.error('删除商品失败:', error);
        alert('删除失败，请重试');
      }
    }
  };

  const handleAddItem = async () => {
    if (!addForm.cookie_id || !addForm.item_id.trim() || !addForm.item_title.trim()) {
      alert('请选择账号，并填写商品ID和商品标题');
      return { success: false };
    }
    try {
      await createItem(addForm.cookie_id, {
        item_id: addForm.item_id.trim(),
        item_title: addForm.item_title.trim(),
        item_price: addForm.item_price.trim(),
        item_image: addForm.item_image.trim(),
        is_multi_spec: addForm.is_multi_spec,
        multi_quantity_delivery: addForm.is_multi_qty_ship,
      });
      setItems(await getItems());
      setShowAddModal(false);
      setAddForm({
        cookie_id: '',
        item_id: '',
        item_title: '',
        item_price: '',
        item_image: '',
        is_multi_spec: false,
        is_multi_qty_ship: false
      });
      return { success: true };
    } catch (error) {
      console.error('添加商品失败:', error);
      alert('添加失败，请重试');
      return { success: false };
    }
  };

  const toggleMultiSpec = async (item: Item) => {
    try {
      const updatedItems = items.map(i =>
        i.cookie_id === item.cookie_id && i.item_id === item.item_id
          ? { ...i, is_multi_spec: !i.is_multi_spec }
          : i
      );
      setItems(updatedItems);
    } catch (error) {
      console.error('切换状态失败:', error);
    }
  };

  const toggleMultiQty = async (item: Item) => {
    try {
      const updatedItems = items.map(i =>
        i.cookie_id === item.cookie_id && i.item_id === item.item_id
          ? { ...i, is_multi_qty_ship: !i.is_multi_qty_ship }
          : i
      );
      setItems(updatedItems);
    } catch (error) {
      console.error('切换状态失败:', error);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">商品管理</h2>
          <p className="text-gray-500 mt-2 text-sm">监控并管理所有账号下的 seshi 商品。</p>
        </div>
        <div className="flex gap-3">
            <select
                className="ios-input px-4 py-3 rounded-xl text-sm"
                value={selectedAccount}
                onChange={e => setSelectedAccount(e.target.value)}
            >
                <option value="">选择账号以同步</option>
                {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.nickname}</option>
                ))}
            </select>
            <button
                onClick={(event) => void runSpectralAction(event.currentTarget, handleSync, { action: 'sync-product' })}
                disabled={loading || !selectedAccount}
                className="ios-btn-primary flex items-center gap-2 px-6 py-3 rounded-2xl font-bold disabled:opacity-50"
            >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                同步商品
            </button>
            <button
              onClick={(event) => void runSpectralAction(event.currentTarget, () => setShowAddModal(true), { action: 'add-product', immediate: true })}
              className="ios-btn-primary px-5 py-3 rounded-2xl font-bold transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              添加商品
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {items.map(item => (
              <div key={`${item.cookie_id}-${item.item_id}`} className="ios-card p-4 rounded-3xl hover:shadow-lg transition group relative">
                  <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      <button
                        onClick={() => handleEdit(item)}
                        className="p-2 bg-spectral-secondary backdrop-blur rounded-lg hover:bg-spectral-hover text-spectral-accent-bright transition-colors"
                        title="编辑"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(item)}
                        className="p-2 bg-red-500/10 backdrop-blur rounded-lg text-red-300 hover:bg-red-500/20 transition-colors"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                  </div>
                  <div className="aspect-square bg-spectral-raised rounded-2xl mb-4 overflow-hidden relative">
                      {item.item_image ? (
                          <img src={item.item_image} alt={`${item.item_title || '商品'}商品图`} width="320" height="320" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-300">
                              <Box className="w-10 h-10 text-spectral-muted" />
                          </div>
                      )}
                      <div className="absolute top-2 left-2 bg-black/50 backdrop-blur-md text-white text-xs font-bold px-2 py-1 rounded-lg">
                          ¥{item.item_price}
                      </div>
                  </div>
                  <h3 className="font-bold text-gray-900 line-clamp-2 text-sm mb-2 h-10 leading-5">{item.item_title}</h3>
                  <div className="flex justify-between items-center text-xs text-gray-500 mb-2">
                      <span className="bg-gray-100 px-2 py-1 rounded-md truncate max-w-[100px]">ID: {item.item_id}</span>
                  </div>
                  <div className="flex gap-2">
                      <button
                        onClick={() => toggleMultiSpec(item)}
                        className={`flex-1 text-xs font-bold px-2 py-1.5 rounded-lg transition-colors ${
                          item.is_multi_spec
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        多规格
                      </button>
                      <button
                        onClick={() => toggleMultiQty(item)}
                        className={`flex-1 text-xs font-bold px-2 py-1.5 rounded-lg transition-colors ${
                          item.is_multi_qty_ship
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        多数量发货
                      </button>
                  </div>
              </div>
          ))}
          {items.length === 0 && (
             <div className="col-span-full py-20 text-center text-gray-400">
                 <ShoppingBag className="w-12 h-12 mx-auto mb-4 opacity-30" />
                 暂无商品数据，请选择账号进行同步
             </div>
          )}
      </div>

      {showAddModal && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="ios-card rounded-3xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h3 className="text-2xl font-extrabold text-gray-900">添加商品</h3>
              <button onClick={() => setShowAddModal(false)} className="p-2 rounded-xl hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">所属账号 *</label>
                <select value={addForm.cookie_id} onChange={e => setAddForm({ ...addForm, cookie_id: e.target.value })} className="w-full ios-input px-4 py-3 rounded-xl">
                  <option value="">请选择账号</option>
                  {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.nickname}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">商品ID *</label>
                <input value={addForm.item_id} onChange={e => setAddForm({ ...addForm, item_id: e.target.value })} placeholder="seshi 商品ID" className="w-full ios-input px-4 py-3 rounded-xl" />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">商品标题 *</label>
                <input value={addForm.item_title} onChange={e => setAddForm({ ...addForm, item_title: e.target.value })} placeholder="商品标题" className="w-full ios-input px-4 py-3 rounded-xl" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">价格</label>
                  <input value={addForm.item_price} onChange={e => setAddForm({ ...addForm, item_price: e.target.value })} placeholder="例如 99.00" className="w-full ios-input px-4 py-3 rounded-xl" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">图片URL</label>
                  <input value={addForm.item_image} onChange={e => setAddForm({ ...addForm, item_image: e.target.value })} placeholder="https://..." className="w-full ios-input px-4 py-3 rounded-xl" />
                </div>
              </div>
              <div className="flex gap-4 text-sm font-bold text-gray-700">
                <label className="flex items-center gap-2"><input type="checkbox" checked={addForm.is_multi_spec} onChange={e => setAddForm({ ...addForm, is_multi_spec: e.target.checked })} />多规格</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={addForm.is_multi_qty_ship} onChange={e => setAddForm({ ...addForm, is_multi_qty_ship: e.target.checked })} />多数量发货</label>
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-gray-100">
              <button onClick={() => setShowAddModal(false)} className="flex-1 px-6 py-3 rounded-xl font-bold bg-gray-100 text-gray-700 hover:bg-gray-200">取消</button>
              <button onClick={(event) => void runSpectralAction(event.currentTarget, handleAddItem, { action: 'add-product' })} className="flex-1 ios-btn-primary px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2"><Plus className="w-4 h-4" />添加商品</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default ItemList;
