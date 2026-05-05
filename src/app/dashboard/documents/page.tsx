'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { 
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { supabase } from '@/lib/supabase'
import { formatFileSize } from '@/lib/utils'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { 
  Upload, 
  Folder,
  FileText,
  Image,
  File,
  MoreVertical,
  Download,
  Share2,
  Trash2,
  Edit3,
  Eye,
  Move,
  Copy,
  Link,
  Search,
  Grid3X3,
  List,
  ChevronRight,
  Plus,
  FileType2
} from 'lucide-react'
import type { Document, DocumentFolder } from '@/types/documents'

const FILE_ICONS: Record<string, any> = {
  pdf: FileText,
  image: Image,
  doc: FileType2,
  default: File
}

export default function DocumentsPage() {
  const router = useRouter()
  const [documents, setDocuments] = useState<Document[]>([])
  const [folders, setFolders] = useState<DocumentFolder[]>([])
  const [currentFolder, setCurrentFolder] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list')
  const [searchQuery, setSearchQuery] = useState('')
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false)
  const [isNewFolderDialogOpen, setIsNewFolderDialogOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  
  // Upload state
  const [uploadFiles, setUploadFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    fetchDocuments()
    fetchFolders()
  }, [currentFolder])

  async function fetchDocuments() {
    setLoading(true)
    let query = supabase
      .from('documents_view')
      .select('*')
      .eq('is_latest_version', true)
      .order('created_at', { ascending: false })
    
    if (currentFolder) {
      // TODO: Join with document_folder_items to filter by folder
    }
    
    const { data } = await query
    
    if (data) {
      // Get signed URLs for documents
      const docsWithUrls = await Promise.all(
        data.map(async (doc: Document) => {
          const { data: urlData } = await supabase.storage
            .from(doc.storage_bucket)
            .createSignedUrl(doc.storage_path, 3600)
          
          return { ...doc, url: urlData?.signedUrl }
        })
      )
      setDocuments(docsWithUrls)
    }
    
    setLoading(false)
  }

  async function fetchFolders() {
    const { data } = await supabase
      .from('document_folders')
      .select('*')
      .is('parent_folder_id', null)
      .order('order_index')
    
    if (data) setFolders(data as DocumentFolder[])
  }

  async function handleUpload() {
    if (uploadFiles.length === 0) return
    
    setUploading(true)
    
    for (const file of uploadFiles) {
      // Upload to Supabase Storage
      const fileExt = file.name.split('.').pop()
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`
      const filePath = `documents/${fileName}`
      
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file)
      
      if (uploadError) {
        console.error('Upload error:', uploadError)
        continue
      }
      
      // Create document record
      const { error: dbError } = await supabase
        .from('documents')
        .insert({
          name: file.name,
          original_name: file.name,
          file_type: fileExt,
          mime_type: file.type,
          file_size_bytes: file.size,
          storage_path: filePath,
          storage_bucket: 'documents',
          category: 'general',
          visibility: 'internal'
        } as any)
      
      if (dbError) {
        console.error('DB error:', dbError)
      }
    }
    
    setUploading(false)
    setUploadFiles([])
    setIsUploadDialogOpen(false)
    fetchDocuments()
  }

  async function createFolder() {
    if (!newFolderName.trim()) return
    
    const { error } = await supabase
      .from('document_folders')
      .insert({
        name: newFolderName,
        parent_folder_id: currentFolder,
        visibility: 'internal',
        order_index: folders.length
      } as any)
    
    if (!error) {
      setNewFolderName('')
      setIsNewFolderDialogOpen(false)
      fetchFolders()
    }
  }

  async function deleteDocument(id: string, storagePath: string) {
    // Delete from storage
    await supabase.storage.from('documents').remove([storagePath])
    
    // Delete from database
    await supabase.from('documents').delete().eq('id', id)
    
    fetchDocuments()
  }

  function getFileIcon(fileType?: string) {
    if (!fileType) return File
    if (fileType.includes('pdf')) return FileText
    if (fileType.includes('image') || fileType.match(/jpg|jpeg|png|gif/)) return Image
    if (fileType.match(/doc|word/)) return FileType2
    return File
  }

  const filteredDocuments = documents.filter(doc => 
    doc.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.contact_company?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Documentos</h1>
          <p className="text-zinc-400 mt-1">Gestiona archivos y documentos del CRM</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="border-zinc-700 text-zinc-300"
            onClick={() => setIsNewFolderDialogOpen(true)}
          >
            <Folder className="h-4 w-4 mr-2" />
            Nueva Carpeta
          </Button>
          <Button 
            className="bg-white text-black hover:bg-zinc-200"
            onClick={() => setIsUploadDialogOpen(true)}
          >
            <Upload className="h-4 w-4 mr-2" />
            Subir Archivo
          </Button>
        </div>
      </div>

      {/* Breadcrumb */}
      <Breadcrumb className="text-zinc-400">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink 
              className="hover:text-white cursor-pointer"
              onClick={() => setCurrentFolder(null)}
            >
              Documentos
            </BreadcrumbLink>
          </BreadcrumbItem>
          {currentFolder && (
            <>
              <BreadcrumbSeparator>
                <ChevronRight className="h-4 w-4" />
              </BreadcrumbSeparator>
              <BreadcrumbItem>
                <span className="text-white">Carpeta actual</span>
              </BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>

      {/* Folders */}
      {folders.length > 0 && (
        <div className="grid gap-3 md:grid-cols-4 lg:grid-cols-6">
          {folders.map(folder => (
            <Card 
              key={folder.id} 
              className="bg-zinc-950 border-zinc-800 hover:border-zinc-700 cursor-pointer transition-colors"
              onClick={() => setCurrentFolder(folder.id)}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <Folder className="h-8 w-8 text-yellow-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium truncate">{folder.name}</p>
                  <p className="text-xs text-zinc-500">{folder.document_count || 0} archivos</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input
            placeholder="Buscar documentos..."
            className="pl-10 bg-zinc-900 border-zinc-800 text-white"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className={viewMode === 'grid' ? 'text-white' : 'text-zinc-500'}
            onClick={() => setViewMode('grid')}
          >
            <Grid3X3 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={viewMode === 'list' ? 'text-white' : 'text-zinc-500'}
            onClick={() => setViewMode('list')}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Documents */}
      {loading ? (
        <div className="text-center py-12 text-zinc-500">Cargando documentos...</div>
      ) : filteredDocuments.length === 0 ? (
        <div className="text-center py-12">
          <File className="h-16 w-16 text-zinc-600 mx-auto mb-4" />
          <p className="text-zinc-500">No hay documentos</p>
          <p className="text-zinc-600 text-sm mt-1">
            Sube tu primer archivo o crea una carpeta
          </p>
        </div>
      ) : viewMode === 'list' ? (
        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="p-0">
            <div className="divide-y divide-zinc-800">
              {filteredDocuments.map((doc) => {
                const Icon = getFileIcon(doc.file_type)
                return (
                  <div 
                    key={doc.id} 
                    className="flex items-center p-4 hover:bg-zinc-900/50 transition-colors"
                  >
                    <Icon className="h-10 w-10 text-zinc-400 mr-4" />
                    
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-white truncate">{doc.name}</h3>
                      <div className="flex items-center gap-3 text-sm text-zinc-500 mt-1">
                        {doc.file_size_bytes && (
                          <span>{formatFileSize(doc.file_size_bytes)}</span>
                        )}
                        <span>{format(new Date(doc.created_at), 'dd MMM yyyy', { locale: es })}</span>
                        {doc.contact_company && (
                          <span className="text-zinc-400">{doc.contact_company}</span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 ml-4">
                      <Badge 
                        variant="outline" 
                        className={
                          doc.visibility === 'client' 
                            ? 'border-green-500 text-green-400' 
                            : 'border-zinc-600 text-zinc-400'
                        }
                      >
                        {doc.visibility}
                      </Badge>
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
                          <DropdownMenuItem 
                            className="text-white"
                            onClick={() => window.open(doc.url, '_blank')}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            Ver
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-white">
                            <Download className="h-4 w-4 mr-2" />
                            Descargar
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-white">
                            <Share2 className="h-4 w-4 mr-2" />
                            Compartir
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-zinc-800" />
                          <DropdownMenuItem 
                            className="text-red-400"
                            onClick={() => deleteDocument(doc.id, doc.storage_path)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
          {filteredDocuments.map((doc) => {
            const Icon = getFileIcon(doc.file_type)
            return (
              <Card key={doc.id} className="bg-zinc-950 border-zinc-800 hover:border-zinc-700 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <Icon className="h-12 w-12 text-zinc-400" />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
                        <DropdownMenuItem className="text-white" onClick={() => window.open(doc.url, '_blank')}>
                          <Eye className="h-4 w-4 mr-2" />
                          Ver
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-white">
                          <Download className="h-4 w-4 mr-2" />
                          Descargar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <h3 className="font-medium text-white truncate mb-1">{doc.name}</h3>
                  <p className="text-sm text-zinc-500">
                    {doc.file_size_bytes && formatFileSize(doc.file_size_bytes)}
                  </p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle>Subir Archivos</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="border-2 border-dashed border-zinc-700 rounded-lg p-8 text-center">
              <input
                type="file"
                multiple
                onChange={(e) => setUploadFiles(Array.from(e.target.files || []))}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                <Upload className="h-12 w-12 text-zinc-500 mx-auto mb-4" />
                <p className="text-zinc-400">
                  Arrastra archivos aquí o haz clic para seleccionar
                </p>
              </label>
            </div>
            
            {uploadFiles.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-zinc-400">Archivos seleccionados:</p>
                {uploadFiles.map((file, i) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-zinc-900 rounded">
                    <span className="text-sm text-white">{file.name}</span>
                    <span className="text-xs text-zinc-500">{formatFileSize(file.size)}</span>
                  </div>
                ))}
              </div>
            )}
            
            <div className="flex justify-end gap-3">
              <Button 
                variant="outline" 
                className="border-zinc-700 text-zinc-300"
                onClick={() => {
                  setIsUploadDialogOpen(false)
                  setUploadFiles([])
                }}
              >
                Cancelar
              </Button>
              <Button 
                className="bg-white text-black hover:bg-zinc-200"
                onClick={handleUpload}
                disabled={uploadFiles.length === 0 || uploading}
              >
                {uploading ? 'Subiendo...' : 'Subir'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Folder Dialog */}
      <Dialog open={isNewFolderDialogOpen} onOpenChange={setIsNewFolderDialogOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle>Nueva Carpeta</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <Input
              placeholder="Nombre de la carpeta"
              className="bg-zinc-900 border-zinc-800 text-white"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
            />
            <div className="flex justify-end gap-3">
              <Button 
                variant="outline" 
                className="border-zinc-700 text-zinc-300"
                onClick={() => {
                  setIsNewFolderDialogOpen(false)
                  setNewFolderName('')
                }}
              >
                Cancelar
              </Button>
              <Button 
                className="bg-white text-black hover:bg-zinc-200"
                onClick={createFolder}
                disabled={!newFolderName.trim()}
              >
                Crear
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
